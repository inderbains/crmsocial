import styles from './RealVoltLogo.module.css';

type RealVoltLogoProps = {
  size?: 'small' | 'medium' | 'large';
  onDark?: boolean;
  className?: string;
};

/** One official RealVolt wordmark. Brand colors never depend on brokerage themes. */
export default function RealVoltLogo({
  size = 'medium',
  onDark = false,
  className = '',
}: RealVoltLogoProps) {
  const classes = [
    styles.logo,
    styles[size],
    onDark ? styles.onDark : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} role="img" aria-label="RealVolt">
      <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
          <path d="M13.6 2.6 5.8 13.1h6l-1.5 8.3 8.1-11.2h-6.1l1.3-7.6Z" />
        </svg>
      </span>
      <span className={styles.wordmark} aria-hidden="true">realvolt<span className={styles.period}>.</span></span>
    </span>
  );
}
