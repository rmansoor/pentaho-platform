package org.pentaho.platform.plugin.services.importer;

import org.apache.commons.logging.Log;
import org.pentaho.platform.api.repository2.unified.IPlatformImportBundle;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;
import org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.ExportManifestMetaStore;

import java.nio.charset.StandardCharsets;
import java.util.Map;

public class MetastoreSolutionImportHandler implements ISolutionComponentImportHandler {
    String componentName;
    private static final String UTF_8 = StandardCharsets.UTF_8.name();
    protected Map<String, RepositoryFileImportBundle.Builder> cachedImports;

    public MetastoreSolutionImportHandler( String componentName, Map<String, RepositoryFileImportBundle.Builder> cachedImports ) {
        this.componentName = componentName;
        this.cachedImports = cachedImports;
    }
    @Override
    public void importComponent(ExportManifest manifest, Log logger, IPlatformImportBundle bundle) {
        importMetaStore(manifest.getMetaStore(), logger, bundle.overwriteInRepository());
    }

    @Override
    public String getComponentName() {
        return componentName;
    }

    protected void importMetaStore(ExportManifestMetaStore manifestMetaStore, Log logger, boolean overwrite ) {
        if ( manifestMetaStore != null ) {
            // get the zipped metastore from the export bundle
            RepositoryFileImportBundle.Builder bundleBuilder =
                    new RepositoryFileImportBundle.Builder()
                            .path( manifestMetaStore.getFile() )
                            .name( manifestMetaStore.getName() )
                            .withParam( "description", manifestMetaStore.getDescription() )
                            .charSet( UTF_8 )
                            .overwriteFile( overwrite )
                            .mime( "application/vnd.pentaho.metastore" );

            cachedImports.put( manifestMetaStore.getFile(), bundleBuilder );
        }
    }
}
