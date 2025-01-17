import { Ok } from "@hazae41/result"
import { RpcId } from "./request"

export interface RpcOkInit<T = unknown> {
  readonly jsonrpc: "2.0"
  readonly id: RpcId,
  readonly result: T
}

export namespace RpcOkInit {

  export function clone<T>(init: RpcOkInit<T>) {
    const { jsonrpc, id, result } = init
    return { jsonrpc, id, result }
  }

}

export namespace RpcOkInit {

  export function from<T>(response: RpcOk<T>): RpcOkInit<T> {
    const { jsonrpc, id, result } = response
    return { jsonrpc, id, result }
  }

}

export class RpcOk<T = unknown> extends Ok<T> {
  readonly jsonrpc = "2.0"

  constructor(
    readonly id: RpcId,
    readonly result: T
  ) {
    super(result)
  }

  static from<T>(init: RpcOkInit<T>) {
    return new RpcOk(init.id, init.result)
  }

}
