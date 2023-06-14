import { EthereumChain } from "@/libs/ethereum/chain"
import { RpcRequestPreinit } from "@/libs/rpc"
import { Optional } from "@hazae41/option"
import { Ok, Result } from "@hazae41/result"
import { Fetched, FetcherMore, createQuerySchema, useError, useFetch, useOnce, useQuery } from "@hazae41/xswr"
import { Backgrounds } from "../../background/background"
import { useBackgrounds } from "../../background/context"

export type Wallet =
  | WalletRef
  | WalletData

export interface WalletProps {
  wallet: Wallet
}

export interface WalletDataProps {
  wallet: WalletData
}

export interface WalletRef {
  ref: true
  uuid: string
}

export type WalletData =
  | EthereumPrivateKeyWallet

export interface EthereumPrivateKeyWallet {
  coin: "ethereum"
  type: "privateKey"

  uuid: string
  name: string,

  color: number,
  emoji: string

  privateKey: string
  address: string
}

export interface BitcoinPrivateKeyWallet {
  coin: "bitcoin"
  type: "privateKey"

  uuid: string
  name: string,

  color: number,
  emoji: string

  privateKey: string
  compressedAddress: string
  uncompressedAddress: string
}

export function getWallet(uuid: Optional<string>, background: Backgrounds) {
  if (uuid === undefined)
    return undefined

  const fetcher = async <T>(init: RpcRequestPreinit<unknown>, more: FetcherMore) =>
    Fetched.rewrap(await background.tryGet(0).then(async r => r.andThen(bg => bg.request<T>(init))))

  return createQuerySchema<RpcRequestPreinit<unknown>, WalletData, Error>({
    method: "brume_getWallet",
    params: [uuid]
  }, fetcher)
}

export function useWallet(uuid: Optional<string>, background: Backgrounds) {
  const query = useQuery(getWallet, [uuid, background])
  useOnce(query)
  return query
}

export type EthereumQueryKey<T> = RpcRequestPreinit<T> & {
  chainId: number
}

export interface EthereumHandle {
  session: string,
  chain: EthereumChain,
  backgrounds: Backgrounds
}

export interface EthereumHandleProps {
  handle: EthereumHandle
}

export function useEthereumHandle(session: string, chain: EthereumChain): EthereumHandle {
  const backgrounds = useBackgrounds()
  return { session, chain, backgrounds }
}

export async function tryFetch<T>(key: EthereumQueryKey<unknown>, handle: EthereumHandle): Promise<Fetched<T, Error>> {
  return await Result.unthrow<Result<T, Error>>(async t => {
    const { backgrounds, session, chain } = handle

    const background = await backgrounds.tryGet(0).then(r => r.throw(t))

    const { method, params } = key
    const subrequest = { method, params }

    const response = await background.request<T>({
      method: "brume_fetchEthereum",
      params: [session, chain.id, subrequest]
    }).then(r => r.throw(t))

    return new Ok(response)
  }).then(r => Fetched.rewrap(r))
}

export function getBalanceSchema(address: string, handle: EthereumHandle) {
  const fetcher = async (init: EthereumQueryKey<unknown>, more: FetcherMore) =>
    await tryFetch<string>(init, handle).then(r => r.mapSync(BigInt))

  return createQuerySchema({
    chainId: handle.chain.id,
    method: "eth_getBalance",
    params: [address, "pending"]
  }, fetcher)
}

export function useBalance(address: string, handle: EthereumHandle) {
  const query = useQuery(getBalanceSchema, [address, handle])
  useFetch(query)
  useError(query, console.error)
  return query
}

export function getNonceSchema(address: string, handle: EthereumHandle) {
  const fetcher = async (init: EthereumQueryKey<unknown>, more: FetcherMore) =>
    await tryFetch<string>(init, handle).then(r => r.mapSync(BigInt))

  return createQuerySchema({
    chainId: handle.chain.id,
    method: "eth_getTransactionCount",
    params: [address, "pending"]
  }, fetcher)
}

export function useNonce(address: string, handle: EthereumHandle) {
  const query = useQuery(getNonceSchema, [address, handle])
  useFetch(query)
  useError(query, console.error)
  return query
}

export function getGasPriceSchema(handle: EthereumHandle) {
  const fetcher = async (init: EthereumQueryKey<unknown>, more: FetcherMore) =>
    await tryFetch<string>(init, handle).then(r => r.mapSync(BigInt))

  return createQuerySchema({
    chainId: handle.chain.id,
    method: "eth_gasPrice",
    params: []
  }, fetcher)
}

export function useGasPrice(handle: EthereumHandle) {
  const query = useQuery(getGasPriceSchema, [handle])
  useFetch(query)
  useError(query, console.error)
  return query
}