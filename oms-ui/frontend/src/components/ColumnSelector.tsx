// ColumnSelector.tsx - Column visibility and ordering management
import React, { useState } from 'react';
import { DomainObjectType } from '../types/types';
import { MetamodelService } from '../services/MetamodelService';
import './ColumnSelector.scss';
import Icon from './icons/Icon';

interface ColumnSelectorProps {
  domainObject: DomainObjectType;
  currentColumns: string[];
  onApply: (columns: string[]) => void;
  onClose: () => void;
  /** The fields that may be chosen; all of the domain object's fields when absent (SPEC-0056). */
  availableFields?: string[];
}

const ColumnSelector: React.FC<ColumnSelectorProps> = ({
  domainObject,
  currentColumns,
  onApply,
  onClose,
  availableFields,
}) => {
  const metamodelService = MetamodelService.getInstance();
  const fullMetadata = metamodelService.getMetamodel(domainObject);
  // In live mode only the fields the stream carries can be chosen (SPEC-0056).
  const metadata = availableFields
    ? {
        ...fullMetadata,
        fields: fullMetadata.fields.filter(f => availableFields.includes(f.name)),
        defaultColumns: fullMetadata.defaultColumns.filter(c => availableFields.includes(c)),
      }
    : fullMetadata;
  const [selectedColumns, setSelectedColumns] = useState<string[]>(currentColumns);

  const toggleColumn = (fieldName: string) => {
    if (selectedColumns.includes(fieldName)) {
      setSelectedColumns(selectedColumns.filter(c => c !== fieldName));
    } else {
      setSelectedColumns([...selectedColumns, fieldName]);
    }
  };

  const selectAll = () => {
    setSelectedColumns(metadata.fields.map(f => f.name));
  };

  const selectNone = () => {
    setSelectedColumns([]);
  };

  const selectDefault = () => {
    setSelectedColumns(metadata.defaultColumns);
  };

  const handleApply = () => {
    onApply(selectedColumns);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="column-selector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Columns</h2>
          <button className="close-button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="bulk-actions">
            <button onClick={selectAll}>Select All</button>
            <button onClick={selectNone}>Select None</button>
            <button onClick={selectDefault}>Default</button>
            <span className="selected-count">
              <span className="count">{selectedColumns.length}</span> of {metadata.fields.length} selected
            </span>
          </div>

          <div className="column-list">
            {metadata.fields.map(field => (
              <label 
                key={field.name} 
                className={`column-item ${selectedColumns.includes(field.name) ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(field.name)}
                  onChange={() => toggleColumn(field.name)}
                />
                <span className="field-name">{field.displayName}</span>
                <span className="field-type">{field.type}</span>
                {field.isComplexObject && <span className="complex-badge">Complex</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <div className="left-actions"></div>
          <div className="right-actions">
            <button onClick={onClose} className="secondary-button">Cancel</button>
            <button onClick={handleApply} className="primary-button">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColumnSelector;
