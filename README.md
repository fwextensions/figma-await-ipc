# figma-await-call

> A convenient `await`-able interface for messaging between the main and UI threads in a Figma plugin.

Figma plugins typically use `postMessage()` to send messages back and forth between the threads, but managing those asynchronous events can be tedious.  Now you can simply `await` the response for a synchronous-style flow, like:

```js
const name = await call("getProperty", "name");
figma.currentPage.selection[0].characters = name;
```


## Installation

```shell
npm install figma-await-call
```


## Usage

```js
import { call, receive, ignore, DeferredPromise } from "figma-await-call";
```


```js
try {
  const data = await call("getData", arg1, arg2);
  console.log("Received data:", data);
} catch (error) {
  console.error("Error fetching data:", error);
}
```


```js
receive("getData", async (arg1, arg2) => {
  // Process data retrieval
  const result = await fetchSomeData(arg1, arg2);
  return result;
});
```


## API

### `call(name, ...data)`


### `receive(name, receiverFn)`


## License

[MIT](./LICENSE) © [John Dunning](https://github.com/fwextensions)
