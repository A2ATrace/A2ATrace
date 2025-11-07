// Type declaration for find-open-port module
declare module 'find-open-port' {
  interface PortOptions {
    start?: number;
    end?: number;
  }

  function findPort(options?: PortOptions): Promise<number>;
  export default findPort;
}
