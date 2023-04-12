import { Hash } from "../hash/hash"

export namespace FromColors {

  export const colors = [
    "from-red-400", "from-orange-400", "from-amber-400",
    "from-yellow-400", "from-lime-400", "from-green-400",
    "from-emerald-400", "from-teal-400", "from-cyan-400",
    "from-sky-400", "from-blue-400", "from-indigo-400",
    "from-violet-400", "from-purple-400", "from-fuchsia-400",
    "from-pink-400", "from-rose-400"
  ] as const

  export function get(index: number) {
    return colors[index % colors.length]
  }

  export function from(seed: string) {
    return get(Hash.from(seed))
  }

}

export function useFromColor(index: number) {
  return FromColors.get(index)
}