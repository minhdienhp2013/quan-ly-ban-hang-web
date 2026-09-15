import { useId, type KeyboardEvent } from 'react';
import { getSteppedVndValue, type VndStepDirection } from './vndMoneyStep';
import './vndMoneyInput.css';

interface VndMoneyInputProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  min?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  ariaLabel?: string;
}

export default function VndMoneyInput({
  label,
  value,
  onChange,
  min = 0,
  required = false,
  disabled = false,
  className,
  labelClassName,
  ariaLabel,
}: VndMoneyInputProps) {
  const generatedId = useId();
  const inputId = `vnd-money-${generatedId}`;
  const accessibleName = ariaLabel ?? label;
  const canStepDown = !disabled && getSteppedVndValue(value, -1, min) !== null;
  const canStepUp = !disabled && getSteppedVndValue(value, 1, min) !== null;

  function applyStep(direction: VndStepDirection) {
    const next = getSteppedVndValue(value, direction, min);
    if (next === null) return;
    onChange(String(next));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    applyStep(event.key === 'ArrowUp' ? 1 : -1);
  }

  return (
    <div className={`vnd-money-input${className ? ` ${className}` : ''}`}>
      <label className={`vnd-money-input__label${labelClassName ? ` ${labelClassName}` : ''}`} htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className="vnd-money-input__field"
        aria-label={accessibleName}
        type="number"
        inputMode="numeric"
        min={min}
        step="any"
        value={value}
        required={required}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <div className="vnd-money-input__steps" aria-label={`Điều chỉnh ${accessibleName}`}>
        <button
          className="vnd-money-input__step"
          type="button"
          aria-label={`Giảm ${accessibleName} 10.000 VND`}
          disabled={!canStepDown}
          onClick={() => applyStep(-1)}
        >
          ▼ 10k
        </button>
        <button
          className="vnd-money-input__step"
          type="button"
          aria-label={`Tăng ${accessibleName} 10.000 VND`}
          disabled={!canStepUp}
          onClick={() => applyStep(1)}
        >
          ▲ 10k
        </button>
      </div>
    </div>
  );
}
