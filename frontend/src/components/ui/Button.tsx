import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * The action-colour categories: create = gold, confirm = blue, danger = red, secondary = neutral with a 1px frame. `ghost` and
 * `danger-text` are frameless text buttons (list actions, "skip"), never a box.
 */
export type ButtonVariant = 'create' | 'confirm' | 'danger' | 'danger-outline' | 'danger-text' | 'secondary' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>
  variant?: ButtonVariant
  small?: boolean
  icon?: IconName
  /** Only the icon is shown (the children are its accessible name, in an sr-only span): a plain icon without frame or fill. */
  iconOnly?: boolean
  /** Shows a spinner over the label; the label stays (invisible) so the button keeps its size. */
  busy?: boolean
  children: ReactNode
}

/**
 * The one button. Every action of the same meaning uses the same variant on every page: "+ New" is `create`, "Save" and
 * "Continue" are `confirm`, destructive actions are `danger`. A busy button never changes size. The box is compact; the target
 * is 48 px in every direction all the same (index.css, .btn::after).
 */
export function Button({ variant = 'secondary', small = false, icon, iconOnly = false, busy = false, children, className = '', disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`btn btn-${variant} ${small ? 'btn-sm' : ''} ${iconOnly ? 'btn-icon' : ''} ${className}`}
      {...rest}
    >
      <span className={`inline-flex items-center gap-2 ${busy ? 'invisible' : ''}`}>
        {icon && <Icon name={icon} size={small ? 15 : 17} />}
        {children}
      </span>
      {busy && <Icon name="loader" size={18} className="absolute animate-spin" />}
    </button>
  )
}
