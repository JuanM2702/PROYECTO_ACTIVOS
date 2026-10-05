import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';

export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = '-- Seleccionar --',
  disabled = false,
  required = false,
  allowCustom = false,
  className = '',
  style = {}
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalizar opciones a estructura { value, label, subtitle }
  const normalizedOptions = options.map(opt => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        value: opt.value !== undefined ? String(opt.value) : String(opt.id || opt.nombre || ''),
        label: opt.label || opt.nombre || opt.area || String(opt.value || opt.id || ''),
        subtitle: opt.subtitle || (opt.punto_venta ? `${opt.punto_venta} (${opt.oficina})` : (opt.role || opt.cedula ? `C.C. ${opt.cedula || 'N/A'} - ${opt.role || ''}` : ''))
      };
    }
    return { value: String(opt), label: String(opt), subtitle: '' };
  });

  // Encontrar opción seleccionada actualmente
  const selectedOption = normalizedOptions.find(opt => opt.value === String(value));
  const displayLabel = selectedOption ? selectedOption.label : (value || '');

  // Cerrar al hacer clic fuera del componente
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Enfocar input de búsqueda al abrir
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
    if (!isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  // Filtrar opciones según el texto ingresado en el buscador
  const filteredOptions = normalizedOptions.filter(opt => {
    const normSearch = search.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normLabel = opt.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normSub = (opt.subtitle || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normLabel.includes(normSearch) || normSub.includes(normSearch);
  });

  const handleSelect = (optValue) => {
    if (disabled) return;
    onChange(optValue);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (disabled) return;
    onChange('');
  };

  const handleCustomChange = (e) => {
    if (!allowCustom) return;
    onChange(e.target.value);
  };

  return (
    <div 
      ref={containerRef} 
      className={`searchable-select-container ${className}`}
      style={{ position: 'relative', width: '100%', minWidth: 0, ...style }}
    >
      {/* Campo Trigger / Control Principal */}
      <div
        className={`input-field searchable-select-trigger ${disabled ? 'disabled' : ''} ${isOpen ? 'open' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          paddingRight: '8px',
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box'
        }}
      >
        {allowCustom && isOpen ? (
          <input
            type="text"
            className="searchable-custom-input"
            value={value}
            onChange={handleCustomChange}
            placeholder={placeholder}
            onClick={(e) => e.stopPropagation()}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'inherit',
              width: '100%',
              fontSize: 'inherit'
            }}
          />
        ) : (
          <span style={{ 
            color: displayLabel ? 'var(--text-primary)' : 'var(--text-tertiary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
            minWidth: 0,
            marginRight: '8px'
          }}>
            {displayLabel || placeholder}
          </span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '4px'
              }}
              title="Limpiar selección"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown 
            size={16} 
            style={{ 
              transition: 'transform 0.2s ease', 
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              color: 'var(--text-tertiary)' 
            }} 
          />
        </div>
      </div>

      {/* Menú Desplegable con Buscador */}
      {isOpen && (
        <div 
          className="searchable-select-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1050,
            maxHeight: '260px',
            overflowY: 'auto',
            background: 'var(--bg-secondary, #ffffff)',
            border: '1px solid var(--border-default, #e2e8f0)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.12))',
            padding: '6px'
          }}
        >
          {/* Header con Buscador en Tiempo Real */}
          <div style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary, #ffffff)', paddingBottom: '6px', zIndex: 2 }}>
            <div className="search-wrapper" style={{ minWidth: 'auto', width: '100%' }}>
              <Search size={14} className="search-icon" style={{ left: '10px' }} />
              <input
                ref={searchInputRef}
                type="text"
                className="input-field"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsOpen(false);
                }}
                style={{
                  paddingLeft: '32px',
                  paddingRight: '10px',
                  height: '34px',
                  fontSize: '13px',
                  width: '100%',
                  background: 'var(--bg-primary, #f4f6f9)',
                  borderColor: 'var(--border-default, #e2e8f0)',
                  color: 'var(--text-primary, #0f172a)'
                }}
              />
            </div>
          </div>

          {/* Opciones filtradas */}
          <div className="searchable-select-options-list">
            {allowCustom && search.trim() && !filteredOptions.some(o => o.label.toLowerCase() === search.trim().toLowerCase()) && (
              <div
                className="searchable-select-item custom-option"
                onClick={() => handleSelect(search.trim())}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: 'var(--accent-primary, #1352e6)',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Usar opción personalizada: "{search.trim()}"</span>
              </div>
            )}

            {filteredOptions.length === 0 && !allowCustom ? (
              <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-tertiary, #64748b)', textAlign: 'center', fontStyle: 'italic' }}>
                No se encontraron coincidencias.
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(value) === opt.value;
                return (
                  <div
                    key={opt.value}
                    className={`searchable-select-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelect(opt.value)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isSelected ? 'var(--accent-primary-light, #ebf3ff)' : 'transparent',
                      color: isSelected ? 'var(--accent-primary, #1352e6)' : 'var(--text-primary, #0f172a)',
                      marginBottom: '2px',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary, #eef2f7)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: isSelected ? '700' : '500' }}>{opt.label}</div>
                      {opt.subtitle && (
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary, #64748b)', marginTop: '2px' }}>
                          {opt.subtitle}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check size={14} color="var(--accent-primary, #1352e6)" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
