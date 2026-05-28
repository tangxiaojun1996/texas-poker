import { io } from "socket.io-client";

export const socket = io({
  autoConnect: true,
  withCredentials: true,
});

export function emitWithAck<TInput, TOutput>(event: string, input: TInput): Promise<TOutput> {
  return new Promise((resolve, reject) => {
    socket.timeout(5_000).emit(event, input, (error: Error | null, response: TOutput) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}
