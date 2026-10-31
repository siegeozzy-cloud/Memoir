import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { EyeIcon, EyeOffIcon, LockIcon } from './icons'

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; icon: ReactNode; trailing?: ReactNode }

export function Field({ id, label, icon, trailing, ...input }: FieldProps) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input">
        {icon}
        <input id={id} {...input} />
        {trailing}
      </div>
    </div>
  )
}

export function PasswordField(props: Omit<FieldProps, 'icon' | 'trailing' | 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <Field
      {...props}
      type={shown ? 'text' : 'password'}
      icon={<LockIcon />}
      trailing={
        <button type="button" className="auth-eye" aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      }
    />
  )
}

export function Check({ children, ...input }: InputHTMLAttributes<HTMLInputElement> & { children: ReactNode }) {
  return (
    <label className="auth-check">
      <input type="checkbox" {...input} />
      <span>{children}</span>
    </label>
  )
}
