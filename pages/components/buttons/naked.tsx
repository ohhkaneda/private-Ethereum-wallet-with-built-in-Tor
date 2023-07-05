import { Outline } from "@/libs/icons/icons";
import { ChildrenProps } from "@/libs/react/props/children";
import { ClassNameProps } from "@/libs/react/props/className";
import { ButtonProps } from '@/libs/react/props/html';
import { OptionalIconProps } from '@/libs/react/props/icon';

export default function Page() {
  return <div className="p-1">
    <NakedButton>
      <InnerButton icon={Outline.GlobeAltIcon}>
        Hello world
      </InnerButton>
    </NakedButton>
    <div className="h-1" />
    <NakedButton>
      <InnerButton>
        Hello world
      </InnerButton>
    </NakedButton>
  </div>
}

export function NakedButton(props: ButtonProps) {
  const { className, children, ...button } = props

  return <button className={`group disabled:opacity-50 rounded-full p-md ${className}`}
    {...button}>
    {children}
  </button>
}

export function InnerButton(props: OptionalIconProps & ChildrenProps & ClassNameProps) {
  const { icon: Icon, children, className } = props

  return <div className={`flex justify-center items-center gap-2 group-enabled:group-active:scale-90 transition-transform ${className}`}>
    {Icon && <Icon className="icon-sm" />}
    {children}
  </div>
}
