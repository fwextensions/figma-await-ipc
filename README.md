# figma-await-ipc

> A simple `await`-able replacement for `postMessage()` in Figma plugins

Figma plugins typically use `postMessage()` to send data back and forth between the main and UI threads, but managing all those asynchronous events and handlers can be tedious.  With `figma-await-ipc`, you can simply `await` the response to get a synchronous-style flow, like:

```typescript
const title = await call("getProperty", "title");
figma.currentPage.selection[0].characters = title;
```


## Installation

```shell
npm install figma-await-ipc
```


## Usage

In a Figma plugin, the code that has access to the document API and the code that renders the UI are in different contexts, so you need to use `postMessage()` to send a request for data from one thread to the other.  The other thread then needs to listen for the `"message"` event and respond by calling `postMessage()` to send back the requested data.  The source thread then *also* needs to listen for the `"message"` event to receive the requested data.

All of this asynchronous event handling is an awkward fit for what is conceptually a synchronous function call.  The `figma-await-ipc` package wraps this process with a simpler interface.

The package's `call()` function lets you essentially call a named function in the other thread, while awaiting the promised result.  Any parameters you pass to `call()` after the function name will be passed into the receiving function:

```typescript
// main.ts
import { call } from "figma-await-ipc";

try {
  const title = await call("getProperty", "title");
  figma.currentPage.selection[0].characters = title;
} catch (error) {
  console.error("Error fetching name property:", error);
}
```

If the called "function" throws an exception in the other thread, that error will be caught and then rethrown in the current thread, so you should wrap the `call()` in a `try/catch` when you know that may happen.

You can also use a standard `then()` method to handle the returned promise:

```typescript
call("getProperty", "title")
  .then((title) => figma.currentPage.selection[0].characters = title)
  .catch(console.error);
```

Of course, making a call from one thread won't do anything if there's nothing in the other thread to receive that call.  So every `call()` to a particular name must be paired with a `receive()` in the other thread to provide a function that will respond to that name:

```typescript
// ui.tsx
import { receive } from "figma-await-ipc";

const storedProperties = { ... };

receive("getProperty", (key) => {
  if (!(key in storedProperties)) {
    throw new Error(`Unsupported property: ${key}`);
  }

  return storedProperties[key];
});
```

Any number of `call()/receive()` pairs can exist within a plugin.

Note that if your code awaits a call to a name that has no receiver registered in the other thread, then it will be queued, and execution will hang at that point.  The call will be connected if a receiver is later registered for that name.  This is useful if one thread starts making calls before the other thread is fully initialized.


## API


### `call(name, [...data])`

Makes a call between the main and UI threads, in either direction.

* `name`: The name of the receiver in the other thread that is expected to respond to this call.
* `...data`: Zero or more parameters to send to the receiver.  They must be of types that can be passed through `postMessage()` via the [structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm).

Returns a promise that should be awaited until the other side responds, and which will be resolved with the return value of the receiver function.

If the receiver function throws an exception, that exception will be rethrown from `call()`, so you should use `try/catch` or `.catch()` to handle that case.

<br>

### `receive(name, receiverFn)`

Registers a function to receive calls with a particular name.  It will receive whatever parameters are passed to the `call()` function.

* `name`: The name of the receiver.
* `receiverFn`: The function that will receive calls to the `name` parameter.

When a call is received, the return value from `receiverFn` will be sent back to the caller.  If it returns a promise, then no response will be sent to the caller until the promise resolves.

Calls to a name that has no receiver will be queued until one is registered, at which point they will be delivered to that new `receiverFn` in order.

Only a single function can respond to any given name, so subsequent calls to `receive()` will replace the previously registered function.

<br>

### `ignore(name)`

Unregisters the receiver for a given function name.

* `name`: The name of the receiver to unregister.

Subsequent calls from the other thread to the unregistered name will be queued until a new function is registered for it.


## License

[MIT](./LICENSE) © [John Dunning](https://github.com/fwextensions)
