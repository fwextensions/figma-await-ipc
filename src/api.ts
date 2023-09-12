import { DeferredPromise } from "./DeferredPromise";

export type ReceiverFn<R> = (...data: any) => R;

type MessageBase = {
	type: "call" | "response" | "error";
	id: number;
	name: string;
}

type CallMessage = MessageBase & {
	type: "call";
	data: any;
}

type ResponseMessage = MessageBase & {
	type: "response";
	data: any;
}

type ErrorMessage = MessageBase & {
	type: "error";
	errorJSON: string;
}

type Message = CallMessage | ResponseMessage | ErrorMessage;

const promisesByID: Record<number, DeferredPromise<any>> = {};
const receiversByName: Record<string, ReceiverFn<unknown>> = {};
let currentID = 0;
let post: (message: Message) => void;

/**
 * Makes a call between the main and UI threads.  It returns a promise that can
 * be awaited until the other side responds.
 *
 * @param {string} name - The name of the receiver in the other thread that is
 * expected to respond this call.
 * @param {...any} data - Zero or more parameters to send to the receiver.  They
 * must be of types that can be passed through `postMessage()`.
 * @return Promise<T> - A promise that will be resolved with the receiver's
 * response when it is sent.
 */
export function call<T>(
	name: string,
	...data: any[])
{
	const id = currentID++;
	const promise = new DeferredPromise<T>();

	promisesByID[id] = promise;
	post({ type: "call", id, name, data });

	return promise;
}

/**
 * Registers a function to receive calls with a particular name.  It will receive
 * whatever parameters are passed to the `call()` function.  Its return value
 * will be sent back to the caller.
 *
 * If the receiver returns a promise, then no response will be sent to the
 * caller until the promise resolves.
 *
 * Only a single function can respond to any given name, so subsequent calls to
 * `receive()` will replace the previously registered function.
 *
 * @param {string} name - The name of the receiver.
 * @param {ReceiverFn} fn - The function that will receive calls to the `name`
 * parameter.
 */
export function receive<R>(
	name: string,
	fn: ReceiverFn<R>)
{
	receiversByName[name] = fn;
}

/**
 * Unregisters the receiver for a given call name.  Subsequent calls to that
 * name from the other thread will never return.
 *
 * @param {string} name - The name of the receiver to unregister.
 */
export function ignore(
	name: string)
{
	delete receiversByName[name];
}

	// add the environment-specific ways of sending/receiving messages
if (typeof window === "undefined") {
	post = (message: Message) => figma.ui.postMessage(message);

	figma.ui.on("message", handleMessage);
} else {
	post = (message: Message) => window.parent.postMessage({ pluginMessage: message }, "*");

	addEventListener("message", ({ data: { pluginMessage } }) => {
		if (pluginMessage && typeof pluginMessage === "object") {
			return handleMessage(pluginMessage);
		}
	});
}

async function handleCall(
	message: CallMessage)
{
	const { id, name, data } = message;
	const receiver = receiversByName[name];

	try {
		const response = await receiver(...data);

		post({ type: "response", id, name, data: response });
	} catch (error) {
			// the Figma postMessage() seems to just stringify everything, but that
			// turns an Error into {}.  so explicitly walk its own properties and
			// stringify that.
		const errorJSON = JSON.stringify(error, Object.getOwnPropertyNames(error));

		post({ type: "error", id, name, errorJSON });
	}
}

function handleResponse(
	message: ResponseMessage)
{
	const { id, data } = message;
	const promise = promisesByID[id];

	promise.resolve(data);
}

function handleError(
	message: ErrorMessage)
{
	const { id, errorJSON } = message;
	const promise = promisesByID[id];
		// parse the stringified error, turn it back into an Error, and reject the
		// promise with it
	const { message: errorMessage, ...rest } = JSON.parse(errorJSON);
		// passing a cause to the constructor is available in Chrome 93+
		//@ts-ignore
	const error = new Error(errorMessage, { cause: rest });

	promise.reject(error);
}

async function handleMessage(
	message: Message)
{
	if (!message || typeof message !== "object") {
		return;
	}

	const { type, id, name } = message;

	switch (type) {
		case "call":
			if (name in receiversByName) {
				await handleCall(message);
			}
			break;

		case "response":
			if (id in promisesByID) {
				handleResponse(message);
			}
			break;

		case "error":
			if (id in promisesByID) {
				handleError(message);
			}
			break;
	}
}
