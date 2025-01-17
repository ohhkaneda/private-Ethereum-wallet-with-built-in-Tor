import { ChildrenProps } from "@/libs/react/props/children"
import { UUIDProps } from "@/libs/react/props/uuid"
import { WalletData } from "@/mods/background/service_worker/entities/wallets/data"
import { Option, Optional } from "@hazae41/option"
import { createContext, useContext } from "react"
import { useWallet } from "./data"

export const WalletDataContext =
  createContext<Optional<WalletData>>(undefined)

export function useWalletData() {
  return Option.unwrap(useContext(WalletDataContext))
}

export function WalletDataProvider(props: UUIDProps & ChildrenProps) {
  const { uuid, children } = props

  const wallet = useWallet(uuid)

  if (wallet.data == null)
    return null

  return <WalletDataContext.Provider value={wallet.data.inner}>
    {children}
  </WalletDataContext.Provider>
}
