/* eslint-disable @next/next/no-img-element */
import { Button } from "@/libs/components/button"
import { Outline } from "@/libs/icons/icons"
import { useBooleanHandle } from "@/libs/react/handles/boolean"
import { CreateProps } from "@/libs/react/props/create"
import { OkProps } from "@/libs/react/props/promise"
import { useBackground } from "@/mods/foreground/background/context"
import { PageBody, PageHeader } from "@/mods/foreground/components/page/header"
import { Page } from "@/mods/foreground/components/page/page"
import { Path } from "@/mods/foreground/router/path"
import { useCallback } from "react"
import { WalletDataProvider, useWalletData } from "../context"
import { Wallet, useTotalPricedBalance } from "../data"
import { useDisplayUsd } from "../page"
import { WalletDataCard } from "../row"
import { WalletCreatorDialog } from "./create"
import { useWallets } from "./data"

export function WalletsPage() {
  const background = useBackground()
  const wallets = useWallets(background)

  const creator = useBooleanHandle(false)

  const totalPricedBalanceQuery = useTotalPricedBalance("usd")
  const totalPricedBalanceDisplay = useDisplayUsd(totalPricedBalanceQuery.current)

  const onWalletClick = useCallback((wallet: Wallet) => {
    Path.go(`/wallet/${wallet.uuid}`)
  }, [])

  const Body =
    <PageBody>
      <div className="mb-8">
        <div className="text-lg font-medium">
          Total balance
        </div>
        <div className="text-2xl font-bold">
          {totalPricedBalanceDisplay}
        </div>
      </div>
      <ClickableWalletGrid
        ok={onWalletClick}
        create={creator.enable}
        wallets={wallets.data?.inner} />
    </PageBody>

  const Header =
    <PageHeader title="Wallets">
      <Button.Naked className="hovered-or-active:scale-105 transition"
        onClick={creator.enable}>
        <Button.Shrink>
          <Outline.PlusIcon className="icon-sm" />
        </Button.Shrink>
      </Button.Naked>
    </PageHeader>

  return <Page>
    {creator.current &&
      <WalletCreatorDialog
        close={creator.disable} />}
    {Header}
    {Body}
  </Page>
}

export function ClickableWalletGrid(props: OkProps<Wallet> & CreateProps & { wallets?: Wallet[] }) {
  const { wallets, ok, create } = props

  return <div className="grid grow place-content-start place-items-center gap-2 grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
    {wallets?.map(wallet =>
      <WalletDataProvider
        key={wallet.uuid}
        uuid={wallet.uuid}>
        <ClickableWalletDataCard ok={ok} />
      </WalletDataProvider>)}
    <NewWalletCard ok={create} />
  </div>
}

export function ClickableWalletDataCard(props: OkProps<Wallet>) {
  const wallet = useWalletData()
  const { ok } = props

  const onClick = useCallback(() => {
    ok(wallet)
  }, [ok, wallet])

  return <button className="w-full hovered-or-active:scale-105 transition-transform"
    onClick={onClick}>
    <WalletDataCard />
  </button>
}

export function NewWalletCard(props: OkProps<unknown>) {
  const { ok } = props

  return <button className="p-md w-full aspect-video rounded-xl flex gap-2 justify-center items-center border border-contrast border-dashed hovered-or-active:scale-105 transition-transform"
    onClick={ok}>
    <Outline.PlusIcon className="icon-sm" />
    <div className="font-medium">
      New wallet
    </div>
  </button>
}
