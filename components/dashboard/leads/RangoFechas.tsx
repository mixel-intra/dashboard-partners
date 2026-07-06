'use client';

// Selector global de rango de fechas — port del bloque .global-range-selector
// de legacy/index.html + setupEventListeners()/setPredefinedRange() de
// legacy/src/dashboard.js (flatpickr modo range + dropdown de rangos
// predefinidos: hoy / 7d / 30d / este mes / mes pasado / todo).
//
// Montaje: va en el headerControls del DashboardShell:
//   <RangoFechas value={{ start, end }} onChange={(v) => setFiltros(f => ({ ...f, ...v }))}
//                labelInicial="Todo el tiempo" />
// Para CEFEMEX (rango server-side) el parent inicializa value con
// rangoMesEnCurso() y labelInicial="Este mes"; el re-fetch lo dispara
// useLeads al cambiar el rango.

import { useEffect, useRef, useState } from 'react';
import flatpickr from 'flatpickr';
import { Spanish } from 'flatpickr/dist/l10n/es';
import 'flatpickr/dist/flatpickr.min.css';
import type { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';

export interface RangoFechasValue {
  start: Date | null;
  end: Date | null;
}

export type RangoPredefinido = 'today' | '7d' | '30d' | 'this-month' | 'last-month' | 'all';

const OPCIONES: { range: RangoPredefinido; label: string }[] = [
  { range: 'today', label: 'Hoy' },
  { range: '7d', label: 'Últimos 7 días' },
  { range: '30d', label: 'Últimos 30 días' },
  { range: 'this-month', label: 'Este mes' },
  { range: 'last-month', label: 'Mes pasado' },
  { range: 'all', label: 'Todo el tiempo' },
];

// Port EXACTO de la matemática de setPredefinedRange(range).
export function calcularRangoPredefinido(range: RangoPredefinido): RangoFechasValue {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  let start: Date | null = null;
  let end: Date | null = today;

  switch (range) {
    case 'today':
      start = new Date();
      start.setHours(0, 0, 0, 0);
      break;
    case '7d':
      start = new Date();
      start.setDate(today.getDate() - 7);
      break;
    case '30d':
      start = new Date();
      start.setDate(today.getDate() - 30);
      break;
    case 'this-month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case 'last-month':
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'all':
    default:
      start = null;
      end = null;
      break;
  }

  return { start, end };
}

export default function RangoFechas({
  value,
  onChange,
  labelInicial = 'Todo el tiempo',
}: {
  value: RangoFechasValue;
  onChange: (v: RangoFechasValue) => void;
  /** Texto inicial del label (CEFEMEX arranca con "Este mes"). */
  labelInicial?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [label, setLabel] = useState(labelInicial);
  const inputRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<FlatpickrInstance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Flatpickr initialization (port de setupEventListeners)
  useEffect(() => {
    if (!inputRef.current) return;
    fpRef.current = flatpickr(inputRef.current, {
      mode: 'range',
      locale: Spanish,
      dateFormat: 'Y-m-d',
      disableMobile: true,
      onClose: (selectedDates) => {
        if (selectedDates.length === 2) {
          const start = selectedDates[0];
          const end = new Date(selectedDates[1]);
          end.setHours(23, 59, 59, 999);
          setLabel('Rango personalizado');
          onChangeRef.current({ start, end });
        }
      },
    }) as FlatpickrInstance;

    return () => {
      fpRef.current?.destroy();
      fpRef.current = null;
    };
  }, []);

  // Sincronizar el visual del picker cuando el rango cambia desde fuera
  // (p. ej. arranque de CEFEMEX con mes en curso).
  useEffect(() => {
    const fp = fpRef.current;
    if (!fp) return;
    if (value.start && value.end) {
      fp.setDate([value.start, value.end], false);
    } else {
      fp.clear(false);
    }
  }, [value.start, value.end]);

  // Cerrar al hacer clic fuera (paridad con el document click del legacy).
  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    document.addEventListener('click', cerrar);
    return () => document.removeEventListener('click', cerrar);
  }, [abierto]);

  function elegirPredefinido(opt: { range: RangoPredefinido; label: string }) {
    setLabel(opt.label);
    onChange(calcularRangoPredefinido(opt.range));
    setAbierto(false);
  }

  return (
    <div className="global-range-selector">
      <div
        className="range-display"
        id="range-picker-toggle"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto((v) => !v);
        }}
      >
        <ion-icon name="calendar-outline"></ion-icon>
        <span id="current-range-label">{label}</span>
        <ion-icon
          name="chevron-down-outline"
          class="chevron"
          style={{ transform: abierto ? 'rotate(180deg)' : 'rotate(0deg)' }}
        ></ion-icon>
      </div>

      <div
        className={`range-dropdown${abierto ? '' : ' hidden'}`}
        id="range-dropdown"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="custom-range-inputs">
          <span className="label">Seleccionar rango personalizado:</span>
          <div className="inputs-row">
            <input
              type="text"
              id="date-range-picker"
              className="range-input-field full-width"
              placeholder="Clic para abrir calendario..."
              readOnly
              ref={inputRef}
            />
          </div>
        </div>
        <div className="dropdown-divider"></div>
        {OPCIONES.map((opt) => (
          <button key={opt.range} className="range-opt" data-range={opt.range} onClick={() => elegirPredefinido(opt)}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
