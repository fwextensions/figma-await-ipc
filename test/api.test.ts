import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlugin, flush, track } from "./harness";

afterEach(() => {
	vi.unstubAllGlobals();
});

async function connected()
{
	const plugin = await createPlugin();
	const ui = await plugin.connectUI();

	await flush();

	return { ...plugin, ui };
}

describe("call() and receive()", () => {
	it("calls from the main thread to the UI", async () => {
		const { main, ui } = await connected();

		ui.receive("add", (a: number, b: number) => a + b);

		expect(await main.call("add", 2, 3)).toBe(5);
	});

	it("calls from the UI to the main thread", async () => {
		const { main, ui } = await connected();

		main.receive("greet", (name: string) => `hi ${name}`);

		expect(await ui.call("greet", "bob")).toBe("hi bob");
	});

	it("passes zero or many arguments through", async () => {
		const { main, ui } = await connected();

		ui.receive("args", (...args: any[]) => args);

		expect(await main.call("args")).toEqual([]);
		expect(await main.call("args", 1, "two", { three: [3] }, null))
			.toEqual([1, "two", { three: [3] }, null]);
	});

	it("waits for an async receiver to resolve before responding", async () => {
		const { main, ui } = await connected();
		let release!: (value: string) => void;

		ui.receive("slow", () => new Promise<string>((resolve) => release = resolve));

		const result = main.call("slow");
		const isSettled = track(result);

		await flush();
		expect(isSettled()).toBe(false);

		release("done");
		expect(await result).toBe("done");
	});

	it("matches concurrent responses to the right callers", async () => {
		const { main, ui } = await connected();
		const releases: Record<string, () => void> = {};

		ui.receive("echo", (value: string) =>
			new Promise((resolve) => releases[value] = () => resolve(value)));

		const a = main.call("echo", "a");
		const b = main.call("echo", "b");
		const c = main.call("echo", "c");

		await flush();
		releases.c();
		releases.a();
		releases.b();

		expect(await Promise.all([a, b, c])).toEqual(["a", "b", "c"]);
	});

	it("replaces a receiver when receive() is called again for a name", async () => {
		const { main, ui } = await connected();

		ui.receive("value", () => 1);
		expect(await main.call("value")).toBe(1);

		ui.receive("value", () => 2);
		expect(await main.call("value")).toBe(2);
	});
});

describe("errors", () => {
	it("rethrows a receiver's Error in the calling thread", async () => {
		const { main, ui } = await connected();

		ui.receive("fail", () => {
			throw Object.assign(new Error("boom"), { code: 42 });
		});

		const error = await main.call("fail").then(
			() => { throw new Error("should have rejected"); },
			(e: any) => e,
		);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("boom");
		expect(error.cause).toMatchObject({ code: 42, stack: expect.stringContaining("boom") });
	});

	it("rethrows an async receiver's rejection", async () => {
		const { main, ui } = await connected();

		main.receive("fail", async () => {
			throw new Error("async boom");
		});

		await expect(ui.call("fail")).rejects.toThrow("async boom");
	});

	it.each([
		["a string", "nope", "nope"],
		["a number", 404, "404"],
		["undefined", undefined, "undefined"],
		["null", null, "null"],
	])("rethrows %s as an Error with that value as its message", async (_, thrown, message) => {
		const { main, ui } = await connected();

		ui.receive("throws", () => { throw thrown; });

		const error: any = await main.call("throws").catch((e: any) => e);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe(message);
	});

	it("rethrows a plain object's properties", async () => {
		const { main, ui } = await connected();

		ui.receive("throws", () => { throw { message: "plain", code: 7 }; });

		const error: any = await main.call("throws").catch((e: any) => e);

		expect(error.message).toBe("plain");
		expect(error.cause).toEqual({ code: 7 });
	});

	it("rethrows an error that can't be stringified", async () => {
		const { main, ui } = await connected();
		const circular: any = new Error("circular");

		circular.self = circular;
		ui.receive("throws", () => { throw circular; });

		await expect(main.call("throws")).rejects.toThrow("circular");
	});
});

describe("queueing", () => {
	it("holds main-thread calls until the UI connects, then sends them in order", async () => {
		const plugin = await createPlugin();
		const first = plugin.main.call("echo", 1);
		const second = plugin.main.call("echo", 2);

		await flush();
		expect(plugin.toUI).not.toHaveBeenCalled();

		const ui = await plugin.connectUI();
		const received: number[] = [];

		ui.receive("echo", (n: number) => (received.push(n), n));

		expect(await Promise.all([first, second])).toEqual([1, 2]);
		expect(received).toEqual([1, 2]);
	});

	it("queues calls to an unregistered name until a receiver is registered", async () => {
		const { main, ui } = await connected();
		const result = main.call("later", "x");
		const isSettled = track(result);

		await flush();
		expect(isSettled()).toBe(false);

		ui.receive("later", (value: string) => value.toUpperCase());

		expect(await result).toBe("X");
	});

	it("delivers queued calls to a new receiver in order", async () => {
		const { main, ui } = await connected();
		const received: number[] = [];
		const calls = [1, 2, 3].map((n) => main.call("ordered", n));

		await flush();
		ui.receive("ordered", (n: number) => (received.push(n), n * 10));

		expect(await Promise.all(calls)).toEqual([10, 20, 30]);
		expect(received).toEqual([1, 2, 3]);
	});

	it("only delivers queued calls for the name being registered", async () => {
		const { main, ui } = await connected();
		const a = main.call("a");
		const b = main.call("b");
		const isBSettled = track(b);

		await flush();
		ui.receive("a", () => "A");

		expect(await a).toBe("A");
		await flush();
		expect(isBSettled()).toBe(false);

		ui.receive("b", () => "B");
		expect(await b).toBe("B");
	});
	it("queues calls after ignore() until a new receiver is registered", async () => {
		const { main, ui } = await connected();

		ui.receive("toggle", () => "first");
		expect(await main.call("toggle")).toBe("first");

		ui.ignore("toggle");

		const result = main.call("toggle");
		const isSettled = track(result);

		await flush();
		expect(isSettled()).toBe(false);

		ui.receive("toggle", () => "second");
		expect(await result).toBe("second");
	});

	it("keeps calls queued when ignore() follows receive() before delivery", async () => {
		const { main, ui } = await connected();
		const result = main.call("flaky", "x");

		await flush();
		ui.receive("flaky", (value: string) => value);
		ui.ignore("flaky");
		await flush();

		const isSettled = track(result);

		await flush();
		expect(isSettled()).toBe(false);

		ui.receive("flaky", (value: string) => value + "!");
		expect(await result).toBe("x!");
	});
});

describe("message handling", () => {
	it("ignores malformed and unknown messages", async () => {
		const { main, ui, sendToMain, sendToUI } = await connected();

		for (const message of [null, undefined, 1, "call", {}, { type: "bogus" }]) {
			await sendToMain(message);
		}

		sendToUI(undefined);
		sendToUI(null);
		sendToUI("not an object");
		sendToUI({ pluginMessage: null });
		sendToUI({ pluginMessage: "string" });

		ui.receive("ping", () => "pong");
		expect(await main.call("ping")).toBe("pong");
	});

	it("ignores responses and errors for unknown IDs", async () => {
		const { main, ui, sendToMain } = await connected();
		let release!: () => void;

		ui.receive("wait", () => new Promise<string>((resolve) => release = () => resolve("real")));

		const result = main.call("wait");

		await flush();
		await sendToMain({ type: "response", id: 999, name: "wait", data: "fake" });
		await sendToMain({ type: "error", id: 999, name: "wait", errorJSON: "{}" });

		release();
		expect(await result).toBe("real");
	});
});
