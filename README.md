# figma-await-call

> A convenient `await`-able interface for messaging between the main and UI threads in a Figma plugin.

Figma plugins typically use `postMessage()` to send messages back and forth between the threads, but managing those asynchronous events can be complex.  Now you can simply `await` the response for a synchronous-style flow, like `const name = await call("getName");`.



## Install

```shell
npm install figma-await-call
```
