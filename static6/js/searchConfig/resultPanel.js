
pimcore.registerNS("pimcore.plugin.esbackendsearch.searchConfig.resultPanel");
pimcore.plugin.esbackendsearch.searchConfig.resultPanel = Class.create(pimcore.object.helpers.gridTabAbstract, {
    systemColumns: ["id", "fullpath", "type", "subtype", "filename", "classname", "creationDate", "modificationDate"],

    parent: null,

    fieldObject: {},
    initialize: function(parent) {
        this.parent = parent;
    },

    getLayout: function () {

        if (this.layout == null) {
            this.layout = new Ext.Panel({
                title: t('plugin_esbackendsearch_results'),
                border: false,
                iconCls: "pimcore_icon_esbackendsearch_grid",
                layout: "fit",
                listeners: {
                    activate: function() {
                        if(this.parent) {
                            var saveData = this.parent.getSaveData(true);
                            this.updateGrid(saveData.classId);
                        }
                    }.bind(this)
                }
            });

            //this is needed
            this.sqlButton = {};
        }

        return this.layout;
    },

    updateGrid: function(classId) {
        this.classId = classId;
        var classStore = pimcore.globalmanager.get("object_types_store");
        var classRecord = classStore.findRecord("id", this.classId);
        if(classRecord) {
            this.selectedClass = classRecord.data.text;

            if (this.parent.getColumnConfig()) {
                this.createGrid(true, {
                    "availableFields": this.parent.getColumnConfig(),
                    "language": this.parent.getLanguage()
                });
            } else {
                Ext.Ajax.request({
                    url: "/admin/object-helper/grid-get-column-config",
                    params: {name: this.selectedClass, gridtype: "grid"},
                    success: this.createGrid.bind(this, false)
                });
            }
        }

    },

    createGrid: function(fromConfig, response) {
        var fields = [];
        if (response.responseText) {
            response = Ext.decode(response.responseText);   // initial config
            fields = response.availableFields;
            this.gridLanguage = response.language;
            this.sortinfo = response.sortinfo;
        } else if (response.availableFields) {
            fields = response.availableFields;      // saved grid config
            this.gridLanguage = response.language;
        } else {
            fields = response;          // grid column editor
        }

        this.parent.setColumnConfig(fields);
        this.parent.setLanguage(this.gridLanguage);

        this.fieldObject = {};
        for(var i = 0; i < fields.length; i++) {
            this.fieldObject[fields[i].key] = fields[i];
        }

        var gridHelper = new pimcore.object.helpers.grid(
            this.selectedClass,
            fields,
            "/plugin/ESBackendSearch/admin/grid-proxy/classId/" + this.classId,
            {language: this.gridLanguage},
            false
        );

        gridHelper.showSubtype = false;
        gridHelper.showKey = true;
        gridHelper.enableEditor = true;

        this.store = gridHelper.getStore();
        var proxy = this.store.getProxy();
        proxy.setActionMethods({
            create : 'GET',
            read   : 'POST',
            update : 'GET',
            destroy: 'GET'
        });

        proxy.extraParams.filter = this.parent.getSaveData();

        var gridColumns = gridHelper.getGridColumns();

        gridColumns.push({
            hideable: false,
            xtype: 'actioncolumn',
            width: 40,
            items: [
                {
                    tooltip: t('open'),
                    icon: "/pimcore/static6/img/flat-color-icons/cursor.svg",
                    handler: function (grid, rowIndex) {
                        var data = grid.getStore().getAt(rowIndex);
                        pimcore.helpers.openObject(data.id, "variant");
                    }.bind(this)
                }
            ]
        });


        this.pagingtoolbar = new Ext.PagingToolbar({
            pageSize: 25,
            store: this.store,
            displayInfo: true,
            displayMsg: '{0} - {1} / {2}',
            emptyMsg: t("no_objects_found")
        });

        this.languageInfo = new Ext.Toolbar.TextItem({
            text: t("grid_current_language") + ": " + pimcore.available_languages[this.gridLanguage]
        });

        this.toolbarFilterInfo =  new Ext.Button({
            iconCls: "pimcore_icon_filter_condition",
            hidden: true,
            text: '<b>' + t("filter_active") + '</b>',
            tooltip: t("filter_condition"),
            handler: function (button) {
                Ext.MessageBox.alert(t("filter_condition"), button.pimcore_filter_condition);
            }.bind(this)
        });

        this.cellEditing = Ext.create('Ext.grid.plugin.CellEditing', {
            clicksToEdit: 1
        });

        var plugins = [this.cellEditing ];

        this.grid = Ext.create('Ext.grid.Panel', {
            frame: false,
            store: this.store,
            border: true,
            columns: gridColumns,
            columnLines: true,
            plugins: plugins,
            stripeRows: true,
            cls: 'pimcore_object_grid_panel',
            bodyCls: "pimcore_editable_grid",
            trackMouseOver: true,
            viewConfig: {
                forceFit: false,
                xtype: 'patchedgridview'
            },
            sortableColumns: false,
            selModel: gridHelper.getSelectionColumn(),
            bbar: this.pagingtoolbar,
            tbar: [
                this.languageInfo, '-', this.toolbarFilterInfo, '->'
                ,"-",{
                    text: t("export_csv"),
                    iconCls: "pimcore_icon_export",
                    handler: function(){

                        Ext.MessageBox.show({
                            title:t('warning'),
                            msg: t('csv_object_export_warning'),
                            buttons: Ext.Msg.OKCANCEL ,
                            fn: function(btn){
                                if (btn == 'ok'){
                                    this.startCsvExport();
                                }
                            }.bind(this),
                            icon: Ext.MessageBox.WARNING
                        });



                    }.bind(this)
                },"-",{
                    text: t("grid_column_config"),
                    iconCls: "pimcore_icon_table_col pimcore_icon_overlay_edit",
                    handler: this.openColumnConfig.bind(this)
                } 
            ],
            listeners: {
                rowdblclick: function (grid, record, tr, rowIndex, e, eOpts ) {

                }.bind(this)
            }
        });
        this.grid.on("rowcontextmenu", this.onRowContextmenu.bind(this));

        this.grid.on("afterrender", function (grid) {
            this.updateGridHeaderContextMenu(grid);
        }.bind(this));

        this.grid.on("sortchange", function(grid, sortinfo) {
            this.sortinfo = sortinfo;
        }.bind(this));

        // check for filter updates
        this.grid.on("filterchange", function () {
            this.filterUpdateFunction(this.grid, this.toolbarFilterInfo);
        }.bind(this));

        gridHelper.applyGridEvents(this.grid);

        this.store.load();

        this.layout.removeAll();
        this.layout.add(this.grid);
        this.layout.updateLayout();
    },

    onRowContextmenu: function (grid, record, tr, rowIndex, e, eOpts ) {

        var menu = new Ext.menu.Menu();
        var data = grid.getStore().getAt(rowIndex);
        var selectedRows = grid.getSelectionModel().getSelection();

        if (selectedRows.length <= 1) {

            menu.add(new Ext.menu.Item({
                text: t('open'),
                iconCls: "pimcore_icon_open",
                handler: function (data) {
                    pimcore.helpers.openObject(data.data.id, "object");
                }.bind(this, data)
            }));
            menu.add(new Ext.menu.Item({
                text: t('show_in_tree'),
                iconCls: "pimcore_icon_show_in_tree",
                handler: function () {
                    try {
                        try {
                            pimcore.treenodelocator.showInTree(record.id, "object", this);
                        } catch (e) {
                            console.log(e);
                        }

                    } catch (e2) { console.log(e2); }
                }
            }));

        } else {
            menu.add(new Ext.menu.Item({
                text: t('open_selected'),
                iconCls: "pimcore_icon_open",
                handler: function (data) {
                    var selectedRows = grid.getSelectionModel().getSelection();
                    for (var i = 0; i < selectedRows.length; i++) {
                        pimcore.helpers.openObject(selectedRows[i].data.id, "object");
                    }
                }.bind(this, data)
            }));
        }

        e.stopEvent();
        menu.showAt(e.pageX, e.pageY);
    },

    batchPrepare: function(columnIndex, onlySelected){
        // no batch for system properties
        if(this.systemColumns.indexOf(this.grid.getColumns()[columnIndex].dataIndex) > -1) {
            return;
        }

        var jobs = [];
        if(onlySelected) {
            var selectedRows = this.grid.getSelectionModel().getSelection();
            for (var i=0; i<selectedRows.length; i++) {
                jobs.push(selectedRows[i].get("id"));
            }
            this.batchOpen(columnIndex,jobs);

        } else {

            var filters = "";
            var condition = "";

            if(this.sqlButton.pressed) {
                condition = this.sqlEditor.getValue();
            } else {
                var filterData = this.store.getFilters().items;
                if(filterData.length > 0) {
                    filters = this.store.getProxy().encodeFilters(filterData);
                }
            }

            var params = {
                filter: this.parent.getSaveData(),
                classId: this.classId,
                objecttype: this.objecttype,
                language: this.gridLanguage
            };


            Ext.Ajax.request({
                url: "/plugin/ESBackendSearch/admin/get-batch-jobs",
                params: params,
                success: function (columnIndex,response) {
                    var rdata = Ext.decode(response.responseText);
                    if (rdata.success && rdata.jobs) {
                        this.batchOpen(columnIndex, rdata.jobs);
                    }

                }.bind(this,columnIndex)
            });
        }

    },
    
    startCsvExport: function () {
        var values = [];
        var filters = "";
        var condition = "";

        var fields = this.getGridConfig().columns;
        var fieldKeys = Object.keys(fields);

        if(this.sqlButton.pressed) {
            condition = this.sqlEditor.getValue();
        } else {
            var store = this.grid.getStore();
            var filterData = store.getFilters();

            var filters = [];
            for (var i = 0; i < filterData.length; i++) {
                var filterItem = filterData.getAt(i);

                var fieldname = filterItem.getProperty();
                var type = this.gridfilters[fieldname];
                if (typeof type == 'object') {
                    type = type.type;
                }
                filters.push({
                    property: fieldname,
                    type: type,
                    comparison: filterItem.getOperator(),
                    value: filterItem.getValue()
                });
            }
            filters = Ext.encode(filters);

        }

        var path = "/admin/object-helper/export/classId/" + this.classId + "/folderId/" + this.element.id ;
        path = path + "/?extjs6=1&" + Ext.urlEncode({
                language: this.gridLanguage,
                filter: filters,
                condition: condition,
                objecttype: this.objecttype,
                "fields[]": fieldKeys
            });
        console.log(path);
        pimcore.helpers.download(path);
    }



});