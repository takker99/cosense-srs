export const emptyStream = <T>(): ReadableStream<T> =>
  new ReadableStream<T>({
    start(controller) {
      controller.close();
    },
  });
