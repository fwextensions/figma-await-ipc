const noop = () => void (0);

/**
 * Represents a deferred promise that can be resolved or rejected via method
 * calls on the instance.
 */
export class DeferredPromise<T> implements Promise<T> {
	private _promise: Promise<T>;

	readonly [Symbol.toStringTag]: string = "Promise";

	/**
	 * Resolves the underlying promise with a specified value.
	 *
	 * @param value - The value to resolve the promise with.
	 */
	resolve: (value: (PromiseLike<T> | T)) => void = noop;

	/**
	 * Rejects the underlying promise with a specified reason.
	 *
	 * @param reason - The reason for rejecting the promise.
	 */
	reject: (reason?: any) => void = noop;

	/**
	 * Creates a new instance of DeferredPromise.
	 */
	constructor()
	{
		this._promise = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}

	/**
	 * Attaches callbacks for the resolution and/or rejection of the promise.
	 *
	 * @param onFulfilled - The callback to execute when the promise is resolved.
	 * @param onRejected - The callback to execute when the promise is rejected.
	 * @returns - A new promise resolved or rejected by the onFulfilled or
	 * onRejected callback.
	 */
	then<TResult1 = T, TResult2 = never>(
		onFulfilled?: (value: T) => (PromiseLike<TResult1> | TResult1),
		onRejected?: (reason: any) => (PromiseLike<TResult2> | TResult2))
	{
		return this._promise.then(onFulfilled, onRejected);
	}

	/**
	 * Attaches a callback for the rejection of the promise.
	 *
	 * @param onRejected - The callback to execute when the promise is rejected.
	 * @returns - A new promise resolved by the onRejected callback.
	 */
	catch<TResult2 = never>(
		onRejected: (reason: any) => (PromiseLike<TResult2> | TResult2))
	{
		return this._promise.catch(onRejected);
	}

	/**
	 * Attaches a callback that is executed when the promise is settled, whether
	 * fulfilled or rejected.
	 *
	 * @param onFinally - The callback to execute when the promise is settled.
	 * @returns - A new promise resolved by the onFinally callback.
	 */
	finally(
		onFinally?: (() => void) | undefined | null)
	{
		return this._promise.finally(onFinally);
	}
}
