import { FixedInit } from "@/libs/bigints/bigints"
import { browser, tryBrowser } from "@/libs/browser/browser"
import { ExtensionPort, Port, WebsitePort } from "@/libs/channel/channel"
import { chainByChainId, pairByAddress, tokenByAddress } from "@/libs/ethereum/mods/chain"
import { Mouse } from "@/libs/mouse/mouse"
import { RpcParamfulRequestInit, RpcParamfulRequestPreinit, RpcRequestInit, RpcRequestPreinit, RpcResponse, RpcResponseInit } from "@/libs/rpc"
import { Circuits } from "@/libs/tor/circuits/circuits"
import { createTorPool, tryCreateTor } from "@/libs/tor/tors/tors"
import { qurl } from "@/libs/url/url"
import { Mutators } from "@/libs/xswr/mutators"
import { Berith } from "@hazae41/berith"
import { Bytes } from "@hazae41/bytes"
import { Circuit, Fallback, TorClientDuplex } from "@hazae41/echalote"
import { Ed25519 } from "@hazae41/ed25519"
import { Future } from "@hazae41/future"
import { Morax } from "@hazae41/morax"
import { Mutex } from "@hazae41/mutex"
import { None, Option, Optional, Some } from "@hazae41/option"
import { Cancel, Looped, Pool, Retry, tryLoop } from "@hazae41/piscine"
import { SuperEventTarget } from "@hazae41/plume"
import { Catched, Err, Ok, Panic, Result } from "@hazae41/result"
import { Sha1 } from "@hazae41/sha1"
import { X25519 } from "@hazae41/x25519"
import { Core, IDBStorage, RawState, SimpleFetcherfulQueryInstance, State } from "@hazae41/xswr"
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from "workbox-precaching"
import { EthereumBrume, EthereumBrumes } from "./entities/brumes/data"
import { Origin, OriginData } from "./entities/origins/data"
import { AppRequest, AppRequestData } from "./entities/requests/data"
import { Seed, SeedData } from "./entities/seeds/data"
import { PersistentSession, SessionData, TemporarySession } from "./entities/sessions/data"
import { Users } from "./entities/users/all/data"
import { User, UserData, UserInit, UserSession, getCurrentUser } from "./entities/users/data"
import { EthereumContext, EthereumQueryKey, Wallet, WalletData, getBalance, getEthereumUnknown, getPairPrice, getTokenBalance, tryEthereumFetch } from "./entities/wallets/data"
import { tryCreateUserStorage } from "./storage"

declare global {
  interface ServiceWorkerGlobalScope {
    __WB_PRODUCTION?: boolean,
  }
}

declare const self: ServiceWorkerGlobalScope

const IS_EXTENSION = location.protocol.endsWith("extension:")
const IS_WEBSITE = !IS_EXTENSION

const IS_CHROME_EXTENSION = location.protocol === "chrome-extension:"
const IS_FIREFOX_EXTENSION = location.protocol === "moz-extension:"
const IS_SAFARI_EXTENSION = location.protocol === "safari-web-extension:"

if (IS_WEBSITE && self.__WB_PRODUCTION) {
  clientsClaim()
  precacheAndRoute(self.__WB_MANIFEST)

  self.addEventListener("message", (event) => {
    if (event.data !== "SKIP_WAITING")
      return
    self.skipWaiting()
  })
}

async function tryFetch<T>(url: string): Promise<Result<T, Error>> {
  try {
    const res = await fetch(url)

    if (!res.ok)
      return new Err(new Error(await res.text()))
    return new Ok(await res.json() as T)
  } catch (e: unknown) {
    return new Err(Catched.from(e))
  }
}

const FALLBACKS_URL = "https://raw.githubusercontent.com/hazae41/echalote/master/tools/fallbacks/fallbacks.json"

export interface PasswordData {
  uuid?: string
  password?: string
}

export interface PopupData {
  window: chrome.windows.Window,
  port: Port
}

export interface Slot<T> {
  current?: T
}

export class Global {

  readonly core = new Core({})

  readonly events = new SuperEventTarget<{
    "popup_hello": (foreground: Port) => Result<void, Error>
    "popup_data": (response: RpcResponseInit<unknown>) => Result<void, Error>
  }>()

  #user?: UserSession
  #path: string = "/"

  /**
   * Scripts by session
   */
  readonly scripts = new Map<string, Set<Port>>()

  /**
   * Session by script
   */
  readonly sessions = new Map<string, string>()

  /**
   * Current popup
   */
  readonly popup = new Mutex<Slot<PopupData>>({})

  constructor(
    readonly tors: Mutex<Pool<TorClientDuplex, Error>>,
    readonly circuits: Mutex<Pool<Circuit, Error>>,
    readonly brumes: Mutex<Pool<EthereumBrume, Error>>,
    readonly storage: IDBStorage
  ) { }

  async tryGetStoredPassword(): Promise<Result<PasswordData, Error>> {
    if (IS_FIREFOX_EXTENSION) {
      const uuid = sessionStorage.getItem("uuid") ?? undefined
      const password = sessionStorage.getItem("password") ?? undefined
      return new Ok({ uuid, password })
    }

    return await tryBrowser(() => browser.storage.session.get(["uuid", "password"]))
  }

  async trySetStoredPassword(uuid: string, password: string) {
    if (IS_FIREFOX_EXTENSION) {
      sessionStorage.setItem("uuid", uuid)
      sessionStorage.setItem("password", password)
      return new Ok({ uuid, password })
    }

    return await tryBrowser(() => browser.storage.session.set({ uuid, password }))
  }

  async tryInit(): Promise<Result<void, Error>> {
    return await Result.unthrow(async t => {
      if (IS_EXTENSION) {
        const { uuid, password } = await this.tryGetStoredPassword().then(r => r.throw(t))
        await this.trySetCurrentUser(uuid, password).then(r => r.throw(t))
      }

      return Ok.void()
    })
  }

  async trySetCurrentUser(uuid: Optional<string>, password: Optional<string>): Promise<Result<Optional<UserSession>, Error>> {
    return await Result.unthrow(async t => {
      if (uuid == null)
        return new Ok(undefined)
      if (password == null)
        return new Ok(undefined)

      const userQuery = await User.schema(uuid, this.storage).make(this.core)
      const userData = Option.wrap(userQuery.current?.get()).ok().throw(t)

      const user: User = { ref: true, uuid: userData.uuid }

      const { storage, hasher, crypter } = await tryCreateUserStorage(userData, password).then(r => r.throw(t))

      const currentUserQuery = await getCurrentUser().make(this.core)
      await currentUserQuery.mutate(Mutators.data<User, never>(user))

      const userSession: UserSession = { user, storage, hasher, crypter }

      this.#user = userSession

      return new Ok(userSession)
    })
  }

  async tryWaitPopupHello(window: chrome.windows.Window) {
    const future = new Future<Result<Port, Error>>()

    const onRequest = (foreground: Port) => {
      future.resolve(new Ok(foreground))
      return new Some(Ok.void())
    }

    const onRemoved = (id: number) => {
      if (id !== window.id)
        return
      future.resolve(new Err(new Error()))
    }

    try {
      this.events.on("popup_hello", onRequest, { passive: true })
      browser.windows.onRemoved.addListener(onRemoved)

      return await future.promise
    } finally {
      this.events.off("popup_hello", onRequest)
      browser.windows.onRemoved.removeListener(onRemoved)
    }
  }

  async tryOpenOrFocusPopup(pathname: string, mouse: Mouse): Promise<Result<PopupData, Error>> {
    return await Result.unthrow(async t => {
      return await this.popup.lock(async (slot) => {
        if (slot.current != null) {
          const windowId = Option.wrap(slot.current.window.id).ok().throw(t)
          const tabId = Option.wrap(slot.current.window.tabs?.[0].id).ok().throw(t)

          await tryBrowser(async () => {
            return await browser.tabs.update(tabId, { highlighted: true })
          }).then(r => r.throw(t))

          await tryBrowser(async () => {
            return await browser.windows.update(windowId, { focused: true })
          }).then(r => r.throw(t))

          return new Ok(slot.current)
        }

        const height = 630
        const width = 400

        const top = Math.max(mouse.y - (height / 2), 0)
        const left = Math.max(mouse.x - (width / 2), 0)

        const window = await tryBrowser(async () => {
          return await browser.windows.create({ type: "popup", url: `popup.html#${pathname}`, state: "normal", height, width, top, left })
        }).then(r => r.throw(t))

        const channel = await this.tryWaitPopupHello(window).then(r => r.throw(t))

        slot.current = { window, port: channel }

        const onRemoved = () => {
          slot.current = undefined

          browser.windows.onRemoved.removeListener(onRemoved)
        }

        browser.windows.onRemoved.addListener(onRemoved)

        return new Ok(slot.current)
      })
    })
  }

  async tryRequestPopup<T>(request: AppRequestData, mouse: Mouse): Promise<Result<RpcResponse<T>, Error>> {
    return await Result.unthrow(async t => {
      const requestQuery = await AppRequest.schema(request.id).make(this.core)
      await requestQuery.mutate(Mutators.data<AppRequestData, never>(request))

      try {
        const { id, method, params } = request
        const url = qurl(`/${method}?id=${id}`, params)

        const popup = await this.tryOpenOrFocusPopup(url, mouse).then(r => r.throw(t))
        const response = await this.tryWaitPopupData<T>(popup, request.id).then(r => r.throw(t))

        return new Ok(response)
      } finally {
        await requestQuery.delete()
      }
    })
  }

  async tryWaitPopupData<T>(popup: PopupData, id: string) {
    const future = new Future<Result<RpcResponse<T>, Error>>()

    const onData = (init: RpcResponseInit<any>) => {
      if (init.id !== id)
        return new None()

      const response = RpcResponse.from<T>(init)
      future.resolve(new Ok(response))
      return new Some(Ok.void())
    }

    const onRemoved = (id: number) => {
      if (id !== popup.window.id)
        return
      future.resolve(new Err(new Error()))
    }

    try {
      this.events.on("popup_data", onData, { passive: true })
      browser.windows.onRemoved.addListener(onRemoved)

      return await future.promise
    } finally {
      this.events.off("popup_data", onData)
      browser.windows.onRemoved.removeListener(onRemoved)
    }
  }

  async tryGetOrWaitEthereumSession(script: Port, mouse: Mouse): Promise<Result<SessionData, Error>> {
    return await Result.unthrow(async t => {
      const currentSession = this.sessions.get(script.name)

      if (currentSession != null) {
        const tempSessionQuery = await TemporarySession.schema(currentSession).make(this.core)
        const tempSessionData = Option.wrap(tempSessionQuery.data?.inner).ok().throw(t)

        return new Ok(tempSessionData)
      }

      const origin = await script.tryRequest<OriginData>({
        method: "brume_origin"
      }).then(r => r.throw(t).throw(t))

      if (this.#user == null)
        await this.tryOpenOrFocusPopup("/", mouse).then(r => r.throw(t))

      const { storage } = Option.wrap(this.#user).ok().throw(t)

      const persSessionQuery = await PersistentSession.schema(origin.origin, storage).make(this.core)
      const maybePersSession = persSessionQuery.data?.inner

      if (maybePersSession != null) {
        const sessionId = maybePersSession.id

        const originQuery = await Origin.schema(origin.origin, storage).make(this.core)
        await originQuery.mutate(Mutators.data(origin))

        const tempSessionQuery = await TemporarySession.schema(sessionId).make(this.core)
        await tempSessionQuery.mutate(Mutators.data(maybePersSession))

        this.sessions.set(script.name, sessionId)

        let scripts = this.scripts.get(sessionId)

        if (scripts == null) {
          scripts = new Set()
          this.scripts.set(sessionId, scripts)
        }

        scripts.add(script)

        script.events.on("close", async () => {
          scripts?.delete(script)
          this.sessions.delete(script.name)
          return new None()
        })

        return new Ok(maybePersSession)
      }

      const originQuery = await Origin.schema(origin.origin, storage).make(this.core)
      await originQuery.mutate(Mutators.data(origin))

      const [persistent, walletId, chainId] = await this.tryRequestPopup<[boolean, string, number]>({
        id: crypto.randomUUID(),
        origin: origin.origin,
        method: "eth_requestAccounts",
        params: {}
      }, mouse).then(r => r.throw(t).throw(t))

      const walletQuery = await Wallet.schema(walletId, storage).make(this.core)
      const wallet = Option.wrap(walletQuery.current?.inner).ok().throw(t)
      const chain = Option.wrap(chainByChainId[chainId]).ok().throw(t)

      const sessionData: SessionData = {
        id: crypto.randomUUID(),
        origin: origin.origin,
        wallets: [wallet],
        chain: chain
      }

      const tempSessionQuery = await TemporarySession.schema(sessionData.id).make(this.core)
      await tempSessionQuery.mutate(Mutators.data(sessionData))

      if (persistent)
        await persSessionQuery.mutate(Mutators.data(sessionData))

      this.sessions.set(script.name, sessionData.id)

      let scripts = this.scripts.get(sessionData.id)

      if (scripts == null) {
        scripts = new Set()
        this.scripts.set(sessionData.id, scripts)
      }

      scripts.add(script)

      script.events.on("close", async () => {
        scripts?.delete(script)
        this.sessions.delete(script.name)
        return new None()
      })

      return new Ok(sessionData)
    })
  }

  async tryRouteContentScript(script: Port, request: RpcRequestPreinit<unknown>) {
    if (request.method === "brume_run")
      return new Some(await this.brume_run(script, request))
    return new None()
  }

  async brume_run(script: Port, request: RpcRequestPreinit<unknown>): Promise<Result<unknown, Error>> {
    return await Result.unthrow(async t => {
      const [subrequest, mouse] = (request as RpcParamfulRequestPreinit<[RpcRequestPreinit<unknown>, Mouse]>).params

      const session = await this.tryGetOrWaitEthereumSession(script, mouse).then(r => r.throw(t))

      const { user, storage } = Option.wrap(this.#user).ok().throw(t)

      const { wallets, chain } = session

      const wallet = Option.wrap(wallets[0]).ok().throw(t)
      const brumes = await this.#getOrCreateEthereumBrumes(wallet)

      const ethereum: EthereumContext = { user, port: script, session, wallet, chain, brumes }

      if (subrequest.method === "eth_requestAccounts")
        return await this.eth_requestAccounts(ethereum, subrequest)
      if (subrequest.method === "eth_accounts")
        return await this.eth_accounts(ethereum, subrequest)
      if (subrequest.method === "eth_sendTransaction")
        return await this.eth_sendTransaction(ethereum, subrequest, mouse)
      if (subrequest.method === "personal_sign")
        return await this.personal_sign(ethereum, subrequest, mouse)
      if (subrequest.method === "eth_signTypedData_v4")
        return await this.eth_signTypedData_v4(ethereum, subrequest, mouse)
      if (subrequest.method === "wallet_switchEthereumChain")
        return await this.wallet_switchEthereumChain(ethereum, subrequest, mouse)

      const query = await getEthereumUnknown(ethereum, subrequest, storage).make(this.core)

      const result = await query.fetch().then(r => r.ignore())

      result.inspectSync(r => r.throw(t))

      const stored = this.core.raw.get(query.cacheKey)?.inner
      const unstored = await this.core.unstore<any, unknown, Error>(stored, { key: query.cacheKey })
      const fetched = Option.wrap(unstored.current).ok().throw(t)

      return fetched
    })
  }

  async eth_requestAccounts(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>): Promise<Result<string[], Error>> {
    return await Result.unthrow(async t => {
      const { storage } = Option.wrap(this.#user).ok().throw(t)
      const session = Option.wrap(ethereum.session).ok().throw(t)

      const addresses = Result.all(await Promise.all(session.wallets.map(async wallet => {
        return await Result.unthrow<Result<string, Error>>(async t => {
          const walletQuery = await Wallet.schema(wallet.uuid, storage).make(this.core)
          const walletData = Option.wrap(walletQuery.data?.inner).ok().throw(t)

          return new Ok(walletData.address)
        })
      }))).throw(t)

      return new Ok(addresses)
    })
  }

  async eth_accounts(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>): Promise<Result<string[], Error>> {
    return await Result.unthrow(async t => {
      const { storage } = Option.wrap(this.#user).ok().throw(t)
      const session = Option.wrap(ethereum.session).ok().throw(t)

      const addresses = Result.all(await Promise.all(session.wallets.map(async wallet => {
        return await Result.unthrow<Result<string, Error>>(async t => {
          const walletQuery = await Wallet.schema(wallet.uuid, storage).make(this.core)
          const walletData = Option.wrap(walletQuery.data?.inner).ok().throw(t)

          return new Ok(walletData.address)
        })
      }))).throw(t)

      return new Ok(addresses)
    })
  }

  async makeEthereumBalance(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>, storage: IDBStorage): Promise<Result<SimpleFetcherfulQueryInstance<EthereumQueryKey<unknown>, FixedInit, Error>, Error>> {
    return await Result.unthrow(async t => {
      const [address, block] = (request as RpcParamfulRequestPreinit<[string, string]>).params

      const query = await getBalance(ethereum, address, block, storage).make(this.core)

      return new Ok(query)
    })
  }

  async eth_getBalance(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>): Promise<Result<unknown, Error>> {
    return await Result.unthrow(async t => {
      const [address, block] = (request as RpcParamfulRequestPreinit<[string, string]>).params

      const { storage } = Option.wrap(this.#user).ok().throw(t)

      const query = await getBalance(ethereum, address, block, storage).make(this.core)

      const result = await query.fetch().then(r => r.ignore())

      result.inspectSync(r => r.throw(t))

      const stored = this.core.raw.get(query.cacheKey)?.inner
      const unstored = await this.core.unstore<any, unknown, any>(stored, { key: query.cacheKey })
      const fetched = Option.wrap(unstored.current).ok().throw(t)

      return fetched
    })
  }

  async makeEthereumPairPrice(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>, storage: IDBStorage): Promise<Result<SimpleFetcherfulQueryInstance<EthereumQueryKey<unknown>, FixedInit, Error>, Error>> {
    return await Result.unthrow(async t => {
      const [address] = (request as RpcParamfulRequestPreinit<[string]>).params

      const pair = Option.wrap(pairByAddress[address]).ok().throw(t)
      const query = await getPairPrice(ethereum, pair, storage).make(this.core)

      return new Ok(query)
    })
  }

  async makeEthereumTokenBalance(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>, storage: IDBStorage): Promise<Result<SimpleFetcherfulQueryInstance<EthereumQueryKey<unknown>, FixedInit, Error>, Error>> {
    return await Result.unthrow(async t => {
      const [account, address, block] = (request as RpcParamfulRequestPreinit<[string, string, string]>).params

      const token = Option.wrap(tokenByAddress[address]).ok().throw(t)
      const query = await getTokenBalance(ethereum, account, token, block, storage).make(this.core)

      return new Ok(query)
    })
  }

  async eth_sendTransaction(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>, mouse: Mouse): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const [{ from, to, gas, value, data }] = (request as RpcParamfulRequestInit<[{
        from: string,
        to: string,
        gas: string,
        value: Optional<string>,
        data: Optional<string>
      }]>).params

      const session = Option.wrap(ethereum.session).ok().throw(t)

      const signature = await this.tryRequestPopup<string>({
        id: crypto.randomUUID(),
        method: "eth_sendTransaction",
        params: { from, to, gas, value, data },
        origin: session.origin,
        session: session.id
      }, mouse).then(r => r.throw(t).throw(t))

      const signal = AbortSignal.timeout(600_000)

      return await tryEthereumFetch<string>(ethereum, {
        method: "eth_sendRawTransaction",
        params: [signature]
      }, { signal }).then(r => r.throw(t))
    })
  }

  async personal_sign(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>, mouse: Mouse): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const [message, address] = (request as RpcParamfulRequestInit<[string, string]>).params

      const session = Option.wrap(ethereum.session).ok().throw(t)

      const signature = await this.tryRequestPopup<string>({
        id: crypto.randomUUID(),
        method: "personal_sign",
        params: { message, address },
        origin: session.origin,
        session: session.id
      }, mouse).then(r => r.throw(t).throw(t))

      return new Ok(signature)
    })
  }

  async eth_signTypedData_v4(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>, mouse: Mouse): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const [address, data] = (request as RpcParamfulRequestInit<[string, string]>).params

      const session = Option.wrap(ethereum.session).ok().throw(t)

      const signature = await this.tryRequestPopup<string>({
        id: crypto.randomUUID(),
        method: "eth_signTypedData_v4",
        params: { data, address },
        origin: session.origin,
        session: session.id
      }, mouse).then(r => r.throw(t).throw(t))

      return new Ok(signature)
    })
  }

  async wallet_switchEthereumChain(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>, mouse: Mouse): Promise<Result<void, Error>> {
    return await Result.unthrow(async t => {
      const [{ chainId }] = (request as RpcParamfulRequestInit<[{ chainId: string }]>).params

      const session = Option.wrap(ethereum.session).ok().throw(t)

      const chain = Option.wrap(chainByChainId[parseInt(chainId, 16)]).ok().throw(t)

      await this.tryRequestPopup<void>({
        id: crypto.randomUUID(),
        method: "wallet_switchEthereumChain",
        params: { chainId },
        origin: session.origin,
        session: session.id
      }, mouse).then(r => r.throw(t).throw(t))

      const { storage } = Option.wrap(this.#user).ok().throw(t)

      const updatedSession = { ...session, chain }

      const tempSessionQuery = await TemporarySession.schema(session.id).make(this.core)
      await tempSessionQuery.mutate(Mutators.replaceData(updatedSession))

      const persSessionQuery = await PersistentSession.schema(session.origin, storage).make(this.core)
      await persSessionQuery.mutate(Mutators.replaceData(updatedSession))

      for (const script of Option.wrap(this.scripts.get(session.id)).unwrapOr([]))
        await script.tryRequest({ method: "chainChanged", params: [chainId] }).then(r => r.ignore())

      return Ok.void()
    })
  }

  async tryRouteForeground(foreground: Port, request: RpcRequestInit<unknown>): Promise<Option<Result<unknown, Error>>> {
    if (request.method === "brume_getPath")
      return new Some(await this.brume_getPath(request))
    if (request.method === "brume_setPath")
      return new Some(await this.brume_setPath(request))
    if (request.method === "brume_login")
      return new Some(await this.brume_login(request))
    if (request.method === "brume_createUser")
      return new Some(await this.brume_createUser(foreground, request))
    // if (request.method === "brume_removeUser")
    //   return new Some(await this.brume_removeUser(foreground, request))
    if (request.method === "brume_createSeed")
      return new Some(await this.brume_createSeed(foreground, request))
    if (request.method === "brume_createWallet")
      return new Some(await this.brume_createWallet(foreground, request))
    // if (request.method === "brume_removeWallet")
    //   return new Some(await this.brume_removeWallet(foreground, request))
    if (request.method === "brume_disconnect")
      return new Some(await this.brume_disconnect(foreground, request))
    if (request.method === "brume_get_global")
      return new Some(await this.brume_get_global(request))
    if (request.method === "brume_get_user")
      return new Some(await this.brume_get_user(request))
    if (request.method === "brume_subscribe")
      return new Some(await this.brume_subscribe(foreground, request))
    if (request.method === "brume_eth_fetch")
      return new Some(await this.brume_eth_fetch(foreground, request))
    if (request.method === "brume_eth_index")
      return new Some(await this.brume_eth_index(foreground, request))
    if (request.method === "brume_log")
      return new Some(await this.brume_log(request))
    if (request.method === "brume_open")
      return new Some(await this.brume_open(foreground, request))
    if (request.method === "brume_encrypt")
      return new Some(await this.brume_encrypt(foreground, request))
    if (request.method === "brume_decrypt")
      return new Some(await this.brume_decrypt(foreground, request))
    if (request.method === "popup_hello")
      return new Some(await this.popup_hello(foreground, request))
    if (request.method === "popup_data")
      return new Some(await this.popup_data(foreground, request))
    return new None()
  }

  async brume_getPath(request: RpcRequestPreinit<unknown>): Promise<Result<string, Error>> {
    return new Ok(this.#path)
  }

  async brume_setPath(request: RpcRequestPreinit<unknown>): Promise<Result<void, Error>> {
    const [path] = (request as RpcParamfulRequestInit<[string]>).params

    this.#path = path

    return Ok.void()
  }

  async popup_hello(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<void, Error>> {
    return Result.unthrow(async t => {
      const returned = await this.events.emit("popup_hello", [foreground])

      if (returned.isSome() && returned.inner.isErr())
        return returned.inner

      return Ok.void()
    })
  }

  async popup_data(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<void, Error>> {
    return Result.unthrow(async t => {
      const [response] = (request as RpcParamfulRequestPreinit<[RpcResponseInit<unknown>]>).params

      const returned = await this.events.emit("popup_data", [response])

      if (returned.isSome() && returned.inner.isErr())
        return returned.inner

      return Ok.void()
    })
  }

  async brume_createUser(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<User[], Error>> {
    return await Result.unthrow(async t => {
      const [init] = (request as RpcParamfulRequestInit<[UserInit]>).params

      const user = await User.tryCreate(init).then(r => r.throw(t))

      const userQuery = await User.schema(init.uuid, this.storage).make(this.core)
      await userQuery.mutate(Mutators.data(user))

      const usersQuery = await Users.schema(this.storage).make(this.core)
      const usersData = Option.wrap(usersQuery.data?.inner).ok().throw(t)

      return new Ok(usersData)
    })
  }

  async brume_login(request: RpcRequestPreinit<unknown>): Promise<Result<void, Error>> {
    return await Result.unthrow(async t => {
      const [uuid, password] = (request as RpcParamfulRequestInit<[string, string]>).params

      await this.trySetCurrentUser(uuid, password).then(r => r.throw(t))

      if (IS_EXTENSION)
        await this.trySetStoredPassword(uuid, password).then(r => r.throw(t))

      return Ok.void()
    })
  }

  async brume_getCurrentUser(request: RpcRequestPreinit<unknown>): Promise<Result<Optional<UserData>, Error>> {
    return await Result.unthrow(async t => {
      const userSession = this.#user

      if (userSession == null)
        return new Ok(undefined)

      const userQuery = await User.schema(userSession.user.uuid, this.storage).make(this.core)

      return new Ok(userQuery.current?.inner)
    })
  }

  async brume_disconnect(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<void, Error>> {
    return await Result.unthrow(async t => {
      const [origin] = (request as RpcParamfulRequestInit<[string]>).params

      const { storage } = Option.wrap(this.#user).ok().throw(t)

      const persSessionQuery = await PersistentSession.schema(origin, storage).make(this.core)
      const persSessionData = Option.wrap(persSessionQuery.data?.inner).ok().throw(t)
      await persSessionQuery.delete()

      const tempSessionQuery = await TemporarySession.schema(persSessionData.id).make(this.core)
      await tempSessionQuery.delete()

      for (const script of Option.wrap(this.scripts.get(persSessionData.id)).unwrapOr([])) {
        await script.tryRequest({ method: "accountsChanged", params: [[]] }).then(r => r.ignore())
        this.sessions.delete(script.name)
      }

      this.scripts.delete(persSessionData.id)

      return Ok.void()
    })
  }

  async brume_open(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<void, Error>> {
    return await Result.unthrow(async t => {
      const [pathname] = (request as RpcParamfulRequestPreinit<[string]>).params

      await tryBrowser(async () => {
        return await browser.tabs.create({ url: `index.html#${pathname}` })
      }).then(r => r.throw(t))

      return Ok.void()
    })
  }

  async brume_encrypt(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<[string, string], Error>> {
    return await Result.unthrow(async t => {
      const [plainBase64] = (request as RpcParamfulRequestInit<[string]>).params

      const { crypter } = Option.wrap(this.#user).ok().throw(t)

      const plain = Bytes.fromBase64(plainBase64)
      const iv = Bytes.tryRandom(16).throw(t)
      const cipher = await crypter.encrypt(plain, iv)

      const ivBase64 = Bytes.toBase64(iv)
      const cipherBase64 = Bytes.toBase64(cipher)

      return new Ok([ivBase64, cipherBase64])
    })
  }

  async brume_decrypt(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const [ivBase64, cipherBase64] = (request as RpcParamfulRequestInit<[string, string]>).params

      const { crypter } = Option.wrap(this.#user).ok().throw(t)

      const iv = Bytes.fromBase64(ivBase64)
      const cipher = Bytes.fromBase64(cipherBase64)
      const plain = await crypter.decrypt(cipher, iv)

      const plainBase64 = Bytes.toBase64(plain)

      return new Ok(plainBase64)
    })
  }

  async brume_createSeed(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<void, Error>> {
    return await Result.unthrow(async t => {
      const [seed] = (request as RpcParamfulRequestInit<[SeedData]>).params

      const { storage } = Option.wrap(this.#user).ok().throw(t)

      const seedQuery = await Seed.Background.schema(seed.uuid, storage).make(this.core)
      await seedQuery.mutate(Mutators.data(seed))

      return Ok.void()
    })
  }

  async brume_createWallet(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<void, Error>> {
    return await Result.unthrow(async t => {
      const [wallet] = (request as RpcParamfulRequestInit<[WalletData]>).params

      const { storage } = Option.wrap(this.#user).ok().throw(t)

      const walletQuery = await Wallet.schema(wallet.uuid, storage).make(this.core)
      await walletQuery.mutate(Mutators.data(wallet))

      return Ok.void()
    })
  }

  async #getOrCreateEthereumBrumes(wallet: Wallet): Promise<EthereumBrumes> {
    const brumesQuery = await EthereumBrumes.schema(wallet).make(this.core)

    if (brumesQuery.current != null)
      return brumesQuery.current.inner

    const brumes = EthereumBrumes.createSubpool(this.brumes, { capacity: 3 })
    await brumesQuery.mutate(Mutators.data(brumes))
    return brumes
  }

  async brume_get_global(request: RpcRequestPreinit<unknown>): Promise<Result<Optional<RawState>, Error>> {
    return await Result.unthrow(async t => {
      const [cacheKey] = (request as RpcParamfulRequestInit<[string]>).params

      const cached = this.core.raw.get(cacheKey)

      if (cached != null)
        return new Ok(cached.inner)

      const stored = await this.storage.get(cacheKey)
      this.core.raw.set(cacheKey, Option.wrap(stored))

      return new Ok(stored)
    })
  }

  async brume_get_user(request: RpcRequestPreinit<unknown>): Promise<Result<Optional<RawState>, Error>> {
    return await Result.unthrow(async t => {
      const [cacheKey] = (request as RpcParamfulRequestInit<[string]>).params

      const { storage } = Option.wrap(this.#user).ok().throw(t)

      const cached = this.core.raw.get(cacheKey)

      if (cached != null)
        return new Ok(cached.inner)

      const stored = await storage.get(cacheKey)
      this.core.raw.set(cacheKey, Option.wrap(stored))

      return new Ok(stored)
    })
  }

  async brume_subscribe(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<void, Error>> {
    return await Result.unthrow(async t => {
      const [cacheKey] = (request as RpcParamfulRequestInit<[string]>).params

      const onState = async (event: CustomEvent<State<any, any>>) => {
        const stored = await this.core.store(event.detail, { key: cacheKey })

        await foreground.tryRequest({
          method: "brume_update",
          params: [cacheKey, stored]
        }).then(r => r.ignore())
      }

      this.core.onState.addListener(cacheKey, onState)

      foreground.events.on("close", () => {
        this.core.onState.removeListener(cacheKey, onState)
        return new None()
      })

      return Ok.void()
    })
  }

  async makeEthereumUnknown(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>, storage: IDBStorage) {
    return new Ok(await getEthereumUnknown(ethereum, request, storage).make(this.core))
  }

  async routeAndMakeEthereum(ethereum: EthereumContext, request: RpcRequestPreinit<unknown>, storage: IDBStorage): Promise<Result<SimpleFetcherfulQueryInstance<any, FixedInit, Error>, Error>> {
    if (request.method === "eth_getBalance")
      return await this.makeEthereumBalance(ethereum, request, storage)
    if (request.method === "eth_getTokenBalance")
      return await this.makeEthereumTokenBalance(ethereum, request, storage)
    if (request.method === "eth_getPairPrice")
      return await this.makeEthereumPairPrice(ethereum, request, storage)
    return await this.makeEthereumUnknown(ethereum, request, storage)
  }

  async brume_eth_index(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<unknown, Error>> {
    return await Result.unthrow(async t => {
      const [walletId, chainId, subrequest] = (request as RpcParamfulRequestInit<[string, number, RpcRequestPreinit<unknown>]>).params

      const { user, storage } = Option.wrap(this.#user).ok().throw(t)

      const walletQuery = await Wallet.schema(walletId, storage).make(this.core)
      const wallet = Option.wrap(walletQuery.current?.get()).ok().throw(t)
      const chain = Option.wrap(chainByChainId[chainId]).ok().throw(t)

      const brumes = await this.#getOrCreateEthereumBrumes(wallet)

      const ethereum = { user, port: foreground, wallet, chain, brumes }

      const query = await this.routeAndMakeEthereum(ethereum, subrequest, storage).then(r => r.throw(t))

      await this.core.reindex(query.cacheKey, query.settings)

      return Ok.void()
    })
  }

  async brume_eth_fetch(foreground: Port, request: RpcRequestPreinit<unknown>): Promise<Result<unknown, Error>> {
    return await Result.unthrow(async t => {
      const [walletId, chainId, subrequest] = (request as RpcParamfulRequestInit<[string, number, RpcRequestPreinit<unknown>]>).params

      const { user, storage } = Option.wrap(this.#user).ok().throw(t)

      const walletQuery = await Wallet.schema(walletId, storage).make(this.core)
      const wallet = Option.wrap(walletQuery.current?.get()).ok().throw(t)
      const chain = Option.wrap(chainByChainId[chainId]).ok().throw(t)

      const brumes = await this.#getOrCreateEthereumBrumes(wallet)

      const ethereum = { user, port: foreground, wallet, chain, brumes }

      const query = await this.routeAndMakeEthereum(ethereum, subrequest, storage).then(r => r.throw(t))

      const result = await query.fetch().then(r => r.ignore())

      result.inspectSync(r => r.throw(t))

      const stored = this.core.raw.get(query.cacheKey)?.inner
      const unstored = await this.core.unstore<any, unknown, Error>(stored, { key: query.cacheKey })
      const fetched = Option.wrap(unstored.current).ok().throw(t)

      return fetched
    })
  }

  async brume_log(request: RpcRequestInit<unknown>): Promise<Result<void, Error>> {
    return await tryLoop(async (i) => {
      return await Result.unthrow<Result<void, Looped<Error>>>(async t => {
        const circuit = await Pool.takeCryptoRandom(this.circuits).then(r => r.mapErrSync(Retry.new).throw(t).result.get())

        const body = JSON.stringify({ tor: true })
        await circuit.tryFetch("https://proxy.brume.money", { method: "POST", body }).then(r => r.inspectErrSync(() => console.warn(`Could not fetch logs`)).mapErrSync(Cancel.new).throw(t))
        await circuit.destroy()

        return Ok.void()
      })
    })
  }

}

async function tryInit() {
  return await Result.recatch(async () => {
    return await Result.unthrow<Result<Global, Error>>(async t => {
      const ed25519 = await Ed25519.fromSafeOrBerith(Berith)
      const x25519 = await X25519.fromSafeOrBerith(Berith)

      await Morax.initBundledOnce()
      const sha1 = Sha1.fromMorax(Morax)

      const fallbacks = await tryFetch<Fallback[]>(FALLBACKS_URL).then(r => r.throw(t))

      const tors = createTorPool(async () => {
        return await tryCreateTor({ fallbacks, ed25519, x25519, sha1 })
      }, { capacity: 9 })

      const circuits = Circuits.createPool(tors, { capacity: 9 })
      const sessions = EthereumBrumes.createPool(chainByChainId, circuits, { capacity: 9 })

      const storage = IDBStorage.tryCreate({ name: "memory" }).unwrap()
      const global = new Global(tors, circuits, sessions, storage)

      await global.tryInit().then(r => r.throw(t))

      return new Ok(global)
    })
  })
}

const init = tryInit()

if (IS_WEBSITE) {

  const onSkipWaiting = (event: ExtendableMessageEvent) =>
    self.skipWaiting()

  const onHelloWorld = async (event: ExtendableMessageEvent) => {
    const raw = event.ports[0]

    const channel = new WebsitePort("foreground", raw)

    channel.events.on("request", async (request) => {
      const inited = await init

      if (inited.isErr())
        return new Some(inited)

      return await inited.get().tryRouteForeground(channel, request)
    })

    raw.start()

    await channel.tryRequest({ method: "brume_hello" }).then(r => r.ignore())

    channel.runPingLoop()
  }

  self.addEventListener("message", (event) => {
    if (event.data === "SKIP_WAITING")
      return void onSkipWaiting(event)
    if (event.data === "HELLO_WORLD")
      return void onHelloWorld(event)
    throw new Panic(`Invalid message`)
  })
}

if (IS_EXTENSION) {

  const onContentScript = (port: chrome.runtime.Port) => {
    const script = new ExtensionPort(crypto.randomUUID(), port)

    script.events.on("request", async (request) => {
      const inited = await init

      if (inited.isErr())
        return new Some(inited)

      return await inited.get().tryRouteContentScript(script, request)
    })
  }

  const onForeground = (port: chrome.runtime.Port) => {
    const channel = new ExtensionPort("foreground", port)

    channel.events.on("request", async (request) => {
      const inited = await init

      if (inited.isErr())
        return new Some(inited)

      return await inited.get().tryRouteForeground(channel, request)
    })
  }

  browser.runtime.onConnect.addListener(port => {
    if (port.name === "foreground")
      return void onForeground(port)
    return void onContentScript(port)
  })

}