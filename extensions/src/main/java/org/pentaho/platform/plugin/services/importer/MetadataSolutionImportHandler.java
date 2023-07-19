package org.pentaho.platform.plugin.services.importer;

import org.apache.commons.logging.Log;
import org.pentaho.platform.api.repository2.unified.IPlatformImportBundle;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;
import org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.ExportManifestMetadata;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

public class MetadataSolutionImportHandler implements ISolutionComponentImportHandler {
    private static final String XMI_EXTENSION = ".xmi";

    private static final String EXPORT_MANIFEST_XML_FILE = "exportManifest.xml";
    private static final String DOMAIN_ID = "domain-id";
    private static final String UTF_8 = StandardCharsets.UTF_8.name();
    String componentName;
    protected Map<String, RepositoryFileImportBundle.Builder> cachedImports;

    public MetadataSolutionImportHandler( String componentName, Map<String, RepositoryFileImportBundle.Builder> cachedImports ) {
        this.componentName = componentName;
        this.cachedImports = cachedImports;
    }

    @Override
    public void importComponent(ExportManifest manifest, Log logger, IPlatformImportBundle bundle ) {
        importMetadata(manifest.getMetadataList(), logger, bundle.overwriteInRepository(), bundle.isPreserveDsw());
    }

    @Override
    public String getComponentName() {
        return componentName;
    }

    /**
     * <p>Import the Metadata</p>
     *
     * @param metadataList metadata to be imported
     * @param preserveDsw  whether or not to preserve DSW settings
     */
    protected void importMetadata(List<ExportManifestMetadata> metadataList, Log logger, boolean overwrite, boolean preserveDsw ) {
        if ( null != metadataList ) {
            for ( ExportManifestMetadata exportManifestMetadata : metadataList ) {
                String domainId = exportManifestMetadata.getDomainId();
                if ( domainId != null && !domainId.endsWith( XMI_EXTENSION ) ) {
                    domainId = domainId + XMI_EXTENSION;
                }
                RepositoryFileImportBundle.Builder bundleBuilder =
                        new RepositoryFileImportBundle.Builder().charSet( UTF_8 )
                                .hidden( RepositoryFile.HIDDEN_BY_DEFAULT ).schedulable( RepositoryFile.SCHEDULABLE_BY_DEFAULT )
                                // let the parent bundle control whether or not to preserve DSW settings
                                .preserveDsw( preserveDsw )
                                .overwriteFile( overwrite )
                                .mime( "text/xmi+xml" )
                                .withParam( DOMAIN_ID, domainId );

                cachedImports.put( exportManifestMetadata.getFile(), bundleBuilder );
            }
        }
    }
}
