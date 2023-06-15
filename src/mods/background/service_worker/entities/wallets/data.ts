import { RpcRequestPreinit } from "@/libs/rpc"
import { Ok } from "@hazae41/result"
import { NormalizerMore, createQuerySchema } from "@hazae41/xswr"
import { EncryptedStorage } from "../../storage"
import { EthereumConnection, EthereumSocket } from "../sessions/data"

export type Wallet =
  | WalletRef
  | WalletData

export interface WalletProps {
  readonly wallet: Wallet
}

export interface WalletDataProps {
  readonly wallet: WalletData
}

export interface WalletRef {
  readonly ref: true
  readonly uuid: string
}

export type WalletData =
  | EthereumPrivateKeyWallet

export interface EthereumPrivateKeyWallet {
  readonly coin: "ethereum"
  readonly type: "privateKey"

  readonly uuid: string
  readonly name: string,

  readonly color: number,
  readonly emoji: string

  readonly privateKey: string
  readonly address: string
}

export interface BitcoinPrivateKeyWallet {
  readonly coin: "bitcoin"
  readonly type: "privateKey"

  readonly uuid: string
  readonly name: string,

  readonly color: number,
  readonly emoji: string

  readonly privateKey: string
  readonly compressedAddress: string
  readonly uncompressedAddress: string
}

export function getWallet(uuid: string, storage: EncryptedStorage) {
  return createQuerySchema<string, WalletData, never>(`wallet/${uuid}`, undefined, { storage: { storage } })
}

export async function getWalletRef(wallet: Wallet, storage: EncryptedStorage, more: NormalizerMore) {
  if ("ref" in wallet) return wallet

  const schema = getWallet(wallet.uuid, storage)
  await schema?.normalize(wallet, more)

  return { ref: true, uuid: wallet.uuid } as WalletRef
}

export type EthereumQueryKey<T> = RpcRequestPreinit<T> & {
  chainId: number
}

export function getBalance(address: string, block: string, connection: EthereumConnection, storage: EncryptedStorage) {
  const fetcher = async ({ method, params }: EthereumQueryKey<unknown>) =>
    await EthereumSocket.tryFetch(connection, { method, params }, {}).then(x => new Ok(x))

  return createQuerySchema({
    chainId: connection.chain.id,
    method: "eth_getBalance",
    params: [address, block]
  }, fetcher, { storage: { storage } })
}