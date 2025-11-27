// FilterBuilder.tsx - Advanced filter UI for constructing complex queries
import React, { useState } from 'react';
import { DomainObjectType, FilterCondition, FilterRule } from '../types/types';
import { MetamodelService } from '../services/MetamodelService';
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

  const operators = [
    { value: '', label: 'Equals' },
    { value: '__like', label: 'Contains' },
    { value: '__gt', label: 'Greater Than' },
    { value: '__gte', label: 'Greater or Equal' },
    { value: '__lt', label: 'Less Than' },
    { value: '__lte', label: 'Less or Equal' },
    { value: '__between', label: 'Between' },
  ];

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
      .map(r => ({
        field: r.field,
        operation: r.operator,
        value: r.value,
        value2: r.value2,
      }));
    onApply(filters);
  };

  const handleClear = () => {
    setRules([{ id: 'rule-0', field: '', operator: '', value: '', value2: undefined }]);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="filter-builder-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Filter Builder</h2>
        
        <div className="filter-rules">
          {rules.map(rule => {
            const field = filterableFields.find(f => f.name === rule.field);
            
            return (
              <div key={rule.id} className="filter-rule">
                <select
                  value={rule.field}
                  onChange={(e) => updateRule(rule.id, { field: e.target.value })}
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
                  {operators.map(op => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>

                <input
                  type={field?.type === 'number' ? 'number' : field?.type === 'date' ? 'datetime-local' : 'text'}
                  value={rule.value}
                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                  placeholder="Value"
                />

                {rule.operator === '__between' && (
                  <input
                    type={field?.type === 'number' ? 'number' : field?.type === 'date' ? 'datetime-local' : 'text'}
                    value={rule.value2 || ''}
                    onChange={(e) => updateRule(rule.id, { value2: e.target.value })}
                    placeholder="Value 2"
                  />
                )}

                <button onClick={() => removeRule(rule.id)} className="remove-button">
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <button onClick={addRule} className="add-rule-button">
          + Add Rule
        </button>

        <div className="modal-actions">
          <button onClick={handleClear} className="secondary-button">Clear All</button>
          <button onClick={onClose} className="secondary-button">Cancel</button>
          <button onClick={handleApply} className="primary-button">Apply Filters</button>
        </div>
      </div>
    </div>
  );
};

export default FilterBuilder;
