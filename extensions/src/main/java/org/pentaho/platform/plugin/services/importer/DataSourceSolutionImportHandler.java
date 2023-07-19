package org.pentaho.platform.plugin.services.importer;

import org.apache.commons.logging.Log;
import org.pentaho.database.model.IDatabaseConnection;
import org.pentaho.platform.api.repository.datasource.IDatasourceMgmtService;
import org.pentaho.platform.api.repository2.unified.IPlatformImportBundle;
import org.pentaho.platform.engine.core.system.PentahoSystem;
import org.pentaho.platform.plugin.services.importexport.DatabaseConnectionConverter;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;
import org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.DatabaseConnection;
import org.pentaho.platform.plugin.services.messages.Messages;

import java.util.List;

public class DataSourceSolutionImportHandler implements ISolutionComponentImportHandler{
    String componentName;

    DataSourceSolutionImportHandler( String componentName ) {
        this.componentName = componentName;
    }
    @Override
    public void importComponent(ExportManifest manifest, Log logger, IPlatformImportBundle bundle) {
        importDataSource(manifest.getDatasourceList(), logger, bundle.overwriteInRepository());
    }

    @Override
    public String getComponentName() {
        return componentName;
    }

    protected void importDataSource(List<DatabaseConnection> datasourceList, Log logger, boolean overwrite ) {
        // Add DB Connections
        if ( datasourceList != null ) {
            IDatasourceMgmtService datasourceMgmtSvc = PentahoSystem.get( IDatasourceMgmtService.class );
            for ( org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.DatabaseConnection databaseConnection : datasourceList ) {
                if ( databaseConnection.getDatabaseType() == null ) {
                    // don't try to import the connection if there is no type it will cause an error
                    // However, if this is the DI Server, and the connection is defined in a ktr, it will import automatically
                    logger.warn( Messages.getInstance()
                            .getString( "SolutionImportHandler.ConnectionWithoutDatabaseType", databaseConnection.getName() ) );
                    continue;
                }
                try {
                    IDatabaseConnection existingDBConnection =
                            datasourceMgmtSvc.getDatasourceByName( databaseConnection.getName() );
                    if ( existingDBConnection != null && existingDBConnection.getName() != null ) {
                        if ( overwrite ) {
                            databaseConnection.setId( existingDBConnection.getId() );
                            datasourceMgmtSvc.updateDatasourceByName( databaseConnection.getName(),
                                    DatabaseConnectionConverter.export2model( databaseConnection ) );
                        }
                    } else {
                        datasourceMgmtSvc.createDatasource( DatabaseConnectionConverter.export2model( databaseConnection ) );
                    }
                } catch ( Exception e ) {
                    e.printStackTrace();
                }
            }
        }
    }
}
