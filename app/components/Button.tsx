import { Link } from 'react-router';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  children: React.ReactNode;
  'aria-label'?: string;
}

export function Button({
  variant = 'primary',
  size = 'medium',
  disabled = false,
  href,
  onClick,
  type = 'button',
  className = '',
  children,
  'aria-label': ariaLabel,
}: ButtonProps) {
  const classes = [
    'button',
    `button--${variant}`,
    size === 'large' ? 'button--large' : '',
    size === 'small' ? 'button--small' : '',
    disabled ? 'button--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (href && !disabled) {
    return (
      <Link to={href} className={classes} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
