import dataWizzLogo from '../assets/datawizz-logo.png'
import dataWizzLogoIcon from '../assets/datawizz-logo-icon.png'
import { cn } from '../lib/utils'

type BrandLogoProps = {
  className?: string
  imageClassName?: string
  priority?: 'default' | 'elevated'
  variant?: 'full' | 'icon'
}

export function BrandLogo({ className, imageClassName, priority = 'default', variant = 'full' }: BrandLogoProps) {
  const isIcon = variant === 'icon'
  const src = isIcon ? dataWizzLogoIcon : dataWizzLogo

  return (
    <div
      className={cn(
        'inline-flex items-center overflow-hidden',
        priority === 'elevated' ? 'shadow-[0_18px_60px_rgba(15,23,42,0.18)]' : 'shadow-sm',
        isIcon ? 'rounded-xl bg-transparent shadow-none' : 'rounded-2xl bg-white',
        className,
      )}
    >
      <img
        src={src}
        alt="DataWizz"
        className={cn(
          isIcon
            ? 'h-full w-full object-contain'
            : 'h-auto w-full object-contain',
          imageClassName,
        )}
      />
    </div>
  )
}
