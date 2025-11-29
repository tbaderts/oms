// rsocket.d.ts - Type declarations for RSocket modules
declare module 'rsocket-core' {
  export class RSocketClient<D, M> {
    constructor(options: any);
    connect(): any;
  }

  export const JsonSerializer: any;
  export const IdentitySerializer: any;
  export const BufferEncoders: any;
  export const MESSAGE_RSOCKET_COMPOSITE_METADATA: { string: string };
  export const MESSAGE_RSOCKET_ROUTING: any;
  
  export function encodeCompositeMetadata(metadata: any[]): Buffer;
  export function encodeRoute(route: string): Buffer;
}

declare module 'rsocket-websocket-client' {
  export default class RSocketWebSocketClient {
    constructor(options: { url: string }, encoders: any);
  }
}
