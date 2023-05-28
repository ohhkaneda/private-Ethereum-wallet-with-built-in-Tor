import { usePoolChange } from "@/libs/pools/pools";
import { ChildrenProps } from "@/libs/react/props/children";
import { Circuit, createCircuitPool } from "@hazae41/echalote";
import { Mutex } from "@hazae41/mutex";
import { Pool } from "@hazae41/piscine";
import { Ok } from "@hazae41/result";
import { createContext, useCallback, useContext, useMemo } from "react";
import { useTor } from "../context";

export const CircuitsContext =
  createContext<Mutex<Pool<Circuit>> | undefined>(undefined)

export function useCircuits() {
  return useContext(CircuitsContext)
}

export function CircuitsProvider(props: ChildrenProps) {
  const { children } = props

  const tor = useTor()

  const circuits = useMemo(() => {
    if (!tor) return

    return new Mutex(createCircuitPool(tor, { capacity: 3 }))
  }, [tor])

  const onPoolChange = useCallback((pool: Pool<Circuit>) => {
    console.log(`Circuits pool: ${pool.size}/${pool.capacity}`)

    return Ok.void()
  }, [])

  usePoolChange(circuits?.inner, onPoolChange)

  return <CircuitsContext.Provider value={circuits}>
    {children}
  </CircuitsContext.Provider>
}