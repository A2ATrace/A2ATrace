declare module 'find-open-port' {
  interface FindPortOptions {
    start?: number;
    end?: number;
    count?: number;
  }

  function findPort(options?: FindPortOptions): Promise<number>;
  export default findPort;
}
