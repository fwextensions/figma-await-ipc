import { describe, expect, it, vi } from "vitest";
import { DeferredPromise } from "../src/DeferredPromise";

describe("DeferredPromise", () => {
	it("resolves with the value passed to resolve()", async () => {
		const dp = new DeferredPromise<number>();

		dp.resolve(42);

		await expect(dp).resolves.toBe(42);
	});

	it("rejects with the reason passed to reject()", async () => {
		const dp = new DeferredPromise();
		const error = new Error("nope");

		dp.reject(error);

		await expect(dp).rejects.toBe(error);
	});

	it("adopts the state of a thenable passed to resolve()", async () => {
		const dp = new DeferredPromise<string>();

		dp.resolve(Promise.resolve("inner"));

		expect(await dp).toBe("inner");
	});

	it("ignores calls after it has settled", async () => {
		const dp = new DeferredPromise<number>();

		dp.resolve(1);
		dp.resolve(2);
		dp.reject(new Error("late"));

		expect(await dp).toBe(1);
	});

	it("supports then(), catch() and finally()", async () => {
		const resolved = new DeferredPromise<number>();
		const rejected = new DeferredPromise<number>();
		const onFinally = vi.fn();

		resolved.resolve(2);
		rejected.reject(new Error("bad"));

		expect(await resolved.then((n) => n * 2)).toBe(4);
		expect(await rejected.catch((e: Error) => e.message)).toBe("bad");
		expect(await resolved.finally(onFinally)).toBe(2);
		expect(onFinally).toHaveBeenCalledOnce();
	});

	it("interoperates with native promise utilities", async () => {
		const a = new DeferredPromise<number>();
		const b = new DeferredPromise<number>();
		const all = Promise.all([a, b]);

		b.resolve(2);
		a.resolve(1);

		expect(await all).toEqual([1, 2]);
		expect(await Promise.resolve(a)).toBe(1);
	});

	it("reports itself as a Promise", () => {
		expect(Object.prototype.toString.call(new DeferredPromise())).toBe("[object Promise]");
	});
});
