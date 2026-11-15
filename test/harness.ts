import { vi } from "vitest";

type Api = typeof import("../src/api");
type Listener = (event: { data: any }) => unknown;

/**
 * Loads two isolated copies of the API, one as the Figma main thread and one
 * as the plugin UI, and wires their postMessage channels together.  Messages
 * are structured-cloned and delivered asynchronously, like the real thing.
 *
 * The UI side isn't loaded until `connectUI()` is called, so tests can make
 * calls from the main thread before the UI has sent its "connect" message.
 */
export async function createPlugin()
{
	let mainHandler: ((message: any) => unknown) | undefined;
	let uiListener: Listener | undefined;

	const toUI = vi.fn((message: any) => {
		const copy = structuredClone(message);

		queueMicrotask(() => uiListener?.({ data: { pluginMessage: copy } }));
	});
	const toMain = vi.fn((data: any, _origin: string) => {
		const { pluginMessage } = structuredClone(data);

		queueMicrotask(() => mainHandler?.(pluginMessage));
	});

		// the API checks `typeof window` once at import time, so the main copy must
		// be imported while `window` is undefined
	vi.resetModules();
	vi.stubGlobal("figma", {
		ui: {
			on(type: string, fn: (message: any) => unknown) {
				if (type === "message") {
					mainHandler = fn;
				}
			},
			postMessage: toUI,
		},
	});

	const main: Api = await import("../src/api");

	async function connectUI(): Promise<Api>
	{
		vi.resetModules();
		vi.stubGlobal("addEventListener", (type: string, fn: Listener) => {
			if (type === "message") {
				uiListener = fn;
			}
		});
		vi.stubGlobal("window", { parent: { postMessage: toMain } });

		return import("../src/api");
	}

	return {
		main,
		connectUI,
		toUI,
		toMain,
			// inject raw messages, bypassing the other side's API
		sendToMain: (message: any) => mainHandler?.(message),
		sendToUI: (data: any) => uiListener?.({ data }),
	};
}

/** Waits for pending timers and microtasks to run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Returns a function that reports whether the promise has settled yet. */
export function track(promise: Promise<unknown>)
{
	let settled = false;

	promise.then(() => settled = true, () => settled = true);

	return () => settled;
}
