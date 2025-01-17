import { Signature } from "@/libs/ethereum/mods/signature"
import { Ledger } from "@/libs/ledger"
import { WebAuthnStorage } from "@/libs/webauthn/webauthn"
import { Seeds, WalletsBySeed } from "@/mods/background/service_worker/entities/seeds/all/data"
import { AuthMnemonicSeedData, LedgerSeedData, SeedData, UnauthMnemonicSeedData } from "@/mods/background/service_worker/entities/seeds/data"
import { Background } from "@/mods/foreground/background/background"
import { useSubscribe } from "@/mods/foreground/storage/storage"
import { useUserStorage } from "@/mods/foreground/storage/user"
import { Bytes } from "@hazae41/bytes"
import { Typed } from "@hazae41/cubane"
import { Option, Optional } from "@hazae41/option"
import { Err, Ok, Panic, Result, Unimplemented } from "@hazae41/result"
import { Core, useQuery } from "@hazae41/xswr"
import { HDKey } from "@scure/bip32"
import { entropyToMnemonic, mnemonicToSeed } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english"
import { Transaction, ethers } from "ethers"

export function useSeeds() {
  const storage = useUserStorage().unwrap()
  const query = useQuery(Seeds.Foreground.schema, [storage])
  useSubscribe(query as any, storage)
  return query
}

export function useWalletsBySeed(uuid: Optional<string>) {
  const storage = useUserStorage().unwrap()
  const query = useQuery(WalletsBySeed.Foreground.schema, [uuid, storage])
  useSubscribe(query as any, storage)
  return query
}

export type SeedInstance =
  | UnauthMnemonicSeedInstance
  | AuthMnemonicSeedInstance
  | LedgerSeedInstance

export namespace SeedInstance {

  export async function tryFrom(seed: SeedData, core: Core, background: Background) {
    if (seed.type === "mnemonic")
      return new Ok(new UnauthMnemonicSeedInstance(seed))
    if (seed.type === "authMnemonic")
      return new Ok(new AuthMnemonicSeedInstance(seed))
    if (seed.type === "ledger")
      return new Ok(new LedgerSeedInstance(seed))
    throw new Panic()
  }

}

export class UnauthMnemonicSeedInstance {

  constructor(
    readonly data: UnauthMnemonicSeedData
  ) { }

  async tryGetMnemonic(core: Core, background: Background): Promise<Result<string, Error>> {
    return new Ok(this.data.mnemonic)
  }

  async tryGetPrivateKey(path: string, core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const mnemonic = await this.tryGetMnemonic(core, background).then(r => r.throw(t))
      const masterSeed = await mnemonicToSeed(mnemonic)

      const root = HDKey.fromMasterSeed(masterSeed)
      const child = root.derive(path)

      const privateKeyBytes = Option.wrap(child.privateKey).ok().throw(t)

      return new Ok(`0x${Bytes.toHex(privateKeyBytes)}`)
    })
  }

  async trySignPersonalMessage(path: string, message: string, core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const privateKey = await this.tryGetPrivateKey(path, core, background).then(r => r.throw(t))

      const signature = await Result.catchAndWrap(async () => {
        return await new ethers.Wallet(privateKey).signMessage(message)
      }).then(r => r.throw(t))

      return new Ok(signature)
    })
  }

  async trySignTransaction(path: string, transaction: Transaction, core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const privateKey = await this.tryGetPrivateKey(path, core, background).then(r => r.throw(t))

      const signature = Result.catchAndWrapSync(() => {
        return new ethers.Wallet(privateKey).signingKey.sign(transaction.unsignedHash).serialized
      }).throw(t)

      return new Ok(signature)
    })
  }

  async trySignEIP712HashedMessage(path: string, data: Typed.TypedData, core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const privateKey = await this.tryGetPrivateKey(path, core, background).then(r => r.throw(t))

      delete (data.types as any)["EIP712Domain"]

      const signature = await Result.catchAndWrap(async () => {
        return await new ethers.Wallet(privateKey).signTypedData(data.domain, data.types, data.message)
      }).then(r => r.throw(t))

      return new Ok(signature)
    })
  }

}

export class AuthMnemonicSeedInstance {

  constructor(
    readonly data: AuthMnemonicSeedData
  ) { }

  async tryGetMnemonic(core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const { idBase64, ivBase64 } = this.data.mnemonic

      const id = Bytes.fromBase64(idBase64)
      const cipher = await WebAuthnStorage.get(id).then(r => r.throw(t))
      const cipherBase64 = Bytes.toBase64(cipher)

      const entropyBase64 = await background.tryRequest<string>({
        method: "brume_decrypt",
        params: [ivBase64, cipherBase64]
      }).then(r => r.throw(t).throw(t))

      const entropy = Bytes.fromBase64(entropyBase64)

      return new Ok(entropyToMnemonic(entropy, wordlist))
    })
  }

  async tryGetPrivateKey(path: string, core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const mnemonic = await this.tryGetMnemonic(core, background).then(r => r.throw(t))
      const masterSeed = await mnemonicToSeed(mnemonic)

      const root = HDKey.fromMasterSeed(masterSeed)
      const child = root.derive(path)

      const privateKeyBytes = Option.wrap(child.privateKey).ok().throw(t)

      return new Ok(`0x${Bytes.toHex(privateKeyBytes)}`)
    })
  }

  async trySignPersonalMessage(path: string, message: string, core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const privateKey = await this.tryGetPrivateKey(path, core, background).then(r => r.throw(t))

      const signature = await Result.catchAndWrap(async () => {
        return await new ethers.Wallet(privateKey).signMessage(message)
      }).then(r => r.throw(t))

      return new Ok(signature)
    })
  }

  async trySignTransaction(path: string, transaction: Transaction, core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const privateKey = await this.tryGetPrivateKey(path, core, background).then(r => r.throw(t))

      const signature = Result.catchAndWrapSync(() => {
        return new ethers.Wallet(privateKey).signingKey.sign(transaction.unsignedHash).serialized
      }).throw(t)

      return new Ok(signature)
    })
  }

  async trySignEIP712HashedMessage(path: string, data: Typed.TypedData, core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const privateKey = await this.tryGetPrivateKey(path, core, background).then(r => r.throw(t))

      delete (data.types as any)["EIP712Domain"]

      const signature = await Result.catchAndWrap(async () => {
        return await new ethers.Wallet(privateKey).signTypedData(data.domain, data.types, data.message)
      }).then(r => r.throw(t))

      return new Ok(signature)
    })
  }

}

export class LedgerSeedInstance {

  constructor(
    readonly data: LedgerSeedData
  ) { }

  async tryGetMnemonic(core: Core, background: Background): Promise<Result<string, Error>> {
    return new Err(new Unimplemented())
  }

  async tryGetPrivateKey(path: string, core: Core, background: Background): Promise<Result<string, Error>> {
    return new Err(new Unimplemented())
  }

  async trySignPersonalMessage(path: string, message: string, core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const device = await Ledger.USB.tryConnect().then(r => r.throw(t))
      const signature = await Ledger.Ethereum.trySignPersonalMessage(device, path.slice(2), Bytes.fromUtf8(message)).then(r => r.throw(t))

      return new Ok(Signature.from(signature))
    })
  }

  async trySignTransaction(path: string, transaction: Transaction, core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const device = await Ledger.USB.tryConnect().then(r => r.throw(t))
      const signature = await Ledger.Ethereum.trySignTransaction(device, path.slice(2), transaction).then(r => r.throw(t))

      return new Ok(Signature.from(signature))
    })
  }

  async trySignEIP712HashedMessage(path: string, data: Typed.TypedData, core: Core, background: Background): Promise<Result<string, Error>> {
    return await Result.unthrow(async t => {
      const device = await Ledger.USB.tryConnect().then(r => r.throw(t))

      delete (data.types as any)["EIP712Domain"]

      const encoder = Result.catchAndWrapSync(() => {
        return new ethers.TypedDataEncoder(data.types)
      }).throw(t)

      const domain = Result.catchAndWrapSync(() => {
        return Bytes.fromHex(ethers.TypedDataEncoder.hashDomain(data.domain).slice(2))
      }).throw(t) as Bytes<32>

      const message = Result.catchAndWrapSync(() => {
        return Bytes.fromHex(encoder.hashStruct(data.primaryType, data.message).slice(2))
      }).throw(t) as Bytes<32>

      const signature = await Ledger.Ethereum.trySignEIP712HashedMessage(device, path.slice(2), domain, message).then(r => r.throw(t))

      return new Ok(Signature.from(signature))
    })
  }

}
