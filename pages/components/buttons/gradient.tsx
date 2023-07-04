import { Colors } from "@/libs/colors/colors";
import { Outline } from "@/libs/icons/icons";
import { ColorIndexProps } from "@/libs/react/props/color";
import { ButtonProps } from '@/libs/react/props/html';
import { InnerButton, NakedButton } from "./naked";

export default function Page() {
  return <GradientButton colorIndex={5}>
    <InnerButton icon={Outline.GlobeAltIcon}>
      Hello world
    </InnerButton>
  </GradientButton>
}

export function GradientButton(props: ButtonProps & ColorIndexProps) {
  const { className, children, colorIndex, ...button } = props

  const color1 = Colors.get(colorIndex)
  const color2 = Colors.get(colorIndex + 1)

  return <NakedButton className={`rounded-xl p-md text-opposite hovered-or-active-or-selected:text-${color1} border border-${color1} bg-gradient-to-r from-${color1} to-${color2} hovered-or-active-or-selected:bg-none transition-colors ${className}`}
    {...button}>
    {children}
  </NakedButton>
}