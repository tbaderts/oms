import React, { Component } from 'react';
import './App.css';

import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/dist/styles/ag-grid.css';
import 'ag-grid-community/dist/styles/ag-theme-balham-dark.css';

import { format } from 'date-fns';

const URL = 'http://localhost:8081/orders/sse/';
const DATE_FORMAT = 'dd/MM/yyyy HH:mm:ss:SSS';

class App extends Component {
    constructor(props) {
        super(props);

        this.state = {
            columnDefs: [
                {headerName: 'OrderID', field: 'id'},
                {headerName: 'State', field: 'state'},
                {headerName: 'Side', field: 'side'},
                {headerName: 'OrderType', field: 'orderType'},
                {headerName: 'Tif', field: 'tif'},
                {headerName: 'Quantity', field: 'quantity'},
                {headerName: 'Symbol', field: 'symbol'},
                {headerName: 'TransactionTimestamp', field: 'transactionTimestamp', valueFormatter: this.dateFormatter}
            ],
            rowSelection: "single",
            paginationPageSize: 50,
            floatingFilter: true,
            getRowNodeId: function (item) {
                return item.id;
            },
            rowData: [],
        };
    }
    
    onGridReady = (params) => {
        console.log('grid ready');
        this.gridApi = params.api;
        this.columnApi = params.columnApi;
        this.gridApi.sizeColumnsToFit();
    }
    
    getRowData = () => {
        var rowData = [];
        this.gridApi.forEachNode(function (node) {
            rowData.push(node.data);
        });
        console.log("Row Data:");
        console.log(rowData);
    }
    
    clearData = () => {
        this.gridApi.setRowData([]);
    }
    
    clearAllFilters = () => {
        this.gridApi.setFilterModel(null);
    }
    
    async componentDidMount() {
        const eventSource = new EventSource(URL);
        eventSource.onopen = event => console.log('open', event);
        eventSource.onmessage = event => {
            var order = JSON.parse(event.data);
            const rowNode = this.gridApi.getRowNode(order.id);
            if (rowNode) {
                console.log('update order: ', order);
                this.gridApi.updateRowData({ update: [order] });
                this.gridApi.flashCells({
                    rowNodes: [rowNode]
                });
            } else {
                console.log('add order: ', order);
                this.gridApi.updateRowData({ add: [order] });
            }
        };
        eventSource.onerror = event => console.log('error', event);
    }
    
    dateFormatter(params) {
    	return format(params.value, DATE_FORMAT);
    }

    render() {
        return (
            <div style={{ height: '800px', width: '100%' }}>
                <div
                    id="orderData"
                    style={{
                        boxSizing: "border-box",
                        height: "100%",
                        width: "100%"
                    }}
                    className="ag-theme-balham-dark"
                >
                    <AgGridReact
                        onGridReady={this.onGridReady}
                        enableSorting={true}
                        enableFilter={true}
                        pagination={true}
                        rowSelection={this.state.rowSelection}
                        rowDeselection={true}
                        enableColResize={true}
                        columnDefs={this.state.columnDefs}
                        rowData={this.state.rowData}
                        getRowNodeId={this.state.getRowNodeId}>
                    </AgGridReact>
                    <button onClick={this.clearAllFilters}>Clear filters</button>
                    <button onClick={this.clearData}>Clear data</button>
                    <button onClick={this.getRowData}>Log to console</button>
                </div>
            </div>
        );
    }
}

export default App;