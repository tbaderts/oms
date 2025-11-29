// FilterBuilder.tsx - Advanced filter UI for constructing complex queries
import React, { useState } from 'react';
import { DomainObjectType, FilterCondition, FilterRule } from '../types/types';
import { MetamodelService } from '../services/MetamodelService';
import { dateTimeService } from '../services/DateTimeService';
import './FilterBuilder.scss';

interface FilterBuilderProps {
  domainObject: DomainObjectType;
  currentFilters: FilterCondition[];
  onApply: (filters: FilterCondition[]) => void;
  onClose: () => void;
}

const FilterBuilder: React.FC<FilterBuilderProps> = ({
  domainObject,
  currentFilters,
  onApply,
  onClose,
}) => {
  const metamodelService = MetamodelService.getInstance();
  const filterableFields = metamodelService.getFilterableFields(domainObject);

  const [rules, setRules] = useState<FilterRule[]>(() => {
    if (currentFilters.length > 0) {
      return currentFilters.map((f, i) => ({
        id: `rule-${i}`,
        field: f.field,
        operator: f.operation || '',
        value: f.value,
        value2: f.value2,
      }));
    }
    return [{ id: 'rule-0', field: '', operator: '', value: '', value2: undefined }];
  });

  // All available operators
  const allOperators = [
    { value: '', label: 'Equals', types: ['string', 'number', 'date', 'enum', 'boolean'] },
    { value: '__like', label: 'Contains', types: ['string'] },
    { value: '__gt', label: 'Greater Than', types: ['number', 'date'] },
    { value: '__gte', label: 'Greater or Equal', types: ['number', 'date'] },
    { value: '__lt', label: 'Less Than', types: ['number', 'date'] },
    { value: '__lte', label: 'Less or Equal', types: ['number', 'date'] },
    { value: '__between', label: 'Between', types: ['number', 'date'] },
  ];

  // Get operators applicable for a field type
  const getOperatorsForField = (field: typeof filterableFields[0] | undefined) => {
    if (!field) return allOperators;
    const fieldType = field.type;
    return allOperators.filter(op => op.types.includes(fieldType));
  };

  const addRule = () => {
    setRules([...rules, { id: `rule-${rules.length}`, field: '', operator: '', value: '', value2: undefined }]);
  };

  const removeRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

  const updateRule = (id: string, updates: Partial<FilterRule>) => {
    setRules(rules.map(r => (r.id === id ? { ...r, ...updates } : r)));
  };

  const handleApply = () => {
    const filters: FilterCondition[] = rules
      .filter(r => r.field && r.value)
      .map(r => {
        const field = filterableFields.find(f => f.name === r.field);
        let value = r.value;
        let value2 = r.value2;
        
        // Convert date values from datetime-local input to ISO-8601 instant format for backend
        if (field?.type === 'date') {
          value = dateTimeService.localInputToInstant(r.value) || r.value;
          if (r.value2) {
            value2 = dateTimeService.localInputToInstant(r.value2) || r.value2;
          }
        }
        
        return {
          field: r.field,
          operation: r.operator,
          value,
          value2,
        };
      });
    onApply(filters);
  };

  const handleClear = () => {
    setRules([{ id: 'rule-0', field: '', operator: '', value: '', value2: undefined }]);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="filter-builder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><span className="modal-icon">🔍</span> Filter Builder</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="filter-rules">
            <div className="filter-rules-header">
              <h3><span className="section-icon">📋</span> Filter Rules</h3>
              <span className="rule-count">{rules.filter(r => r.field && r.value).length} active</span>
            </div>
            {rules.map(rule => {
              const field = filterableFields.find(f => f.name === rule.field);
              const applicableOperators = getOperatorsForField(field);
              
              // Render value input based on field type
              const renderValueInput = (value: any, onChange: (val: string) => void, placeholder: string) => {
                if (field?.type === 'enum' && field.enumValues) {
                  return (
                    <select
                      value={value || ''}
                      onChange={(e) => onChange(e.target.value)}
                    >
                      <option value="">Select {field.displayName}...</option>
                      {field.enumValues.map(ev => (
                        <option key={ev.value} value={ev.value}>
                          {ev.label}
                        </option>
                      ))}
                    </select>
                  );
                } else if (field?.type === 'boolean') {
                  return (
                    <select
                      value={value || ''}
                      onChange={(e) => onChange(e.target.value)}
                    >
                      <option value="">Select...</option>
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  );
                } else {
                  return (
                    <input
                      type={field?.type === 'number' ? 'number' : field?.type === 'date' ? 'datetime-local' : 'text'}
                      value={value || ''}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder={placeholder}
                    />
                  );
                }
              };
              
              return (
                <div key={rule.id} className="filter-rule">
                <select
                  value={rule.field}
                  onChange={(e) => updateRule(rule.id, { field: e.target.value, operator: '', value: '', value2: undefined })}
                >
                  <option value="">Select field...</option>
                  {filterableFields.map(f => (
                    <option key={f.name} value={f.name}>
                      {f.displayName}
                    </option>
                  ))}
                </select>

                <select
                  value={rule.operator}
                  onChange={(e) => updateRule(rule.id, { operator: e.target.value })}
                >
                  {applicableOperators.map(op => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>

                {renderValueInput(rule.value, (val) => updateRule(rule.id, { value: val }), 'Value')}

                {rule.operator === '__between' && (
                  renderValueInput(rule.value2, (val) => updateRule(rule.id, { value2: val }), 'Value 2')
                )}

                <button onClick={() => removeRule(rule.id)} className="remove-button">
                  ✕
                </button>
              </div>
            );
          })}
          </div>

          <div className="add-rule-section">
            <button onClick={addRule} className="add-rule-button">
              Add Rule
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <div className="left-actions">
            <button onClick={handleClear} className="secondary-button">Clear All</button>
          </div>
          <div className="right-actions">
            <button onClick={onClose} className="secondary-button">Cancel</button>
            <button onClick={handleApply} className="primary-button">Apply Filters</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterBuilder;
