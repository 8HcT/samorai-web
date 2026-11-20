import { useState, type InputHTMLAttributes } from 'react';

/**
 * Campo de contraseña con botón para verla mientras se escribe (útil sobre
 * todo en el móvil). El botón no envía el formulario.
 */
export function PasswordInput({
  showLabel,
  hideLabel,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { showLabel: string; hideLabel: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-input">
      <input {...input} type={visible ? 'text' : 'password'} autoCapitalize="off" spellCheck={false} />
      <button
        type="button"
        className="password-input__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}
