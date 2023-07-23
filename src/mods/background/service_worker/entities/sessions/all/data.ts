import { IDBStorage, createQuerySchema } from "@hazae41/xswr"
import { SessionRef } from "../data"

export namespace Sessions {

  export function query(storage: IDBStorage) {
    return createQuerySchema<string, SessionRef[], never>({ key: `persistentSessions`, storage })
  }

}

export namespace SessionsByWallet {

  export function query(wallet: string, storage: IDBStorage) {
    return createQuerySchema<string, SessionRef[], never>({ key: `persistentSessionsByWallet/${wallet}`, storage })
  }

}
