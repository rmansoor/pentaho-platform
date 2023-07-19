package org.pentaho.platform.plugin.services.importer;

import org.apache.commons.logging.Log;
import org.pentaho.platform.api.repository2.unified.IPlatformImportBundle;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;
import org.pentaho.platform.plugin.services.importexport.exportManifest.Parameters;
import org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.ExportManifestMondrian;
import org.pentaho.platform.plugin.services.importexport.legacy.MondrianCatalogRepositoryHelper;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

public class MondrianSolutionImportHandler  implements  ISolutionComponentImportHandler {
    private static final String DOMAIN_ID = "domain-id";
    private static final String UTF_8 = StandardCharsets.UTF_8.name();
    protected Map<String, RepositoryFileImportBundle.Builder> cachedImports;
    String componentName;

    public MondrianSolutionImportHandler( String componentName, Map<String, RepositoryFileImportBundle.Builder> cachedImports ) {
        this.componentName = componentName;
        this.cachedImports = cachedImports;
    }
    @Override
    public void importComponent(ExportManifest manifest, Log logger, IPlatformImportBundle bundle) {
        importMondrian(manifest.getMondrianList(), logger, bundle.overwriteInRepository());
    }

    @Override
    public String getComponentName() {
        return componentName;
    }

    protected void importMondrian( List<ExportManifestMondrian> mondrianList, Log logger,boolean overwrite ) {
        if ( null != mondrianList ) {
            for ( ExportManifestMondrian exportManifestMondrian : mondrianList ) {

                String catName = exportManifestMondrian.getCatalogName();
                Parameters parametersMap = exportManifestMondrian.getParameters();
                StringBuilder parametersStr = new StringBuilder();
                for ( Map.Entry<String, String> e : parametersMap.entrySet() ) {
                    parametersStr.append( e.getKey() ).append( '=' ).append( e.getValue() ).append( ';' );
                }

                RepositoryFileImportBundle.Builder bundleBuilder =
                        new RepositoryFileImportBundle.Builder().charSet( UTF_8 ).hidden( RepositoryFile.HIDDEN_BY_DEFAULT )
                                .schedulable( RepositoryFile.SCHEDULABLE_BY_DEFAULT ).name( catName ).overwriteFile(
                                overwrite ).mime( "application/vnd.pentaho.mondrian+xml" )
                                .withParam( "parameters", parametersStr.toString() )
                                .withParam( DOMAIN_ID, catName ); // TODO: this is definitely named wrong at the very least.
                // pass as param if not in parameters string
                String xmlaEnabled = "" + exportManifestMondrian.isXmlaEnabled();
                bundleBuilder.withParam( "EnableXmla", xmlaEnabled );

                cachedImports.put( exportManifestMondrian.getFile(), bundleBuilder );

                String annotationsFile = exportManifestMondrian.getAnnotationsFile();
                if ( annotationsFile != null ) {
                    RepositoryFileImportBundle.Builder annotationsBundle =
                            new RepositoryFileImportBundle.Builder().path( MondrianCatalogRepositoryHelper.ETC_MONDRIAN_JCR_FOLDER
                                    + RepositoryFile.SEPARATOR + catName ).name( "annotations.xml" ).charSet( UTF_8 ).overwriteFile(
                                    overwrite ).mime( "text/xml" ).hidden( RepositoryFile.HIDDEN_BY_DEFAULT ).schedulable(
                                    RepositoryFile.SCHEDULABLE_BY_DEFAULT ).withParam( DOMAIN_ID, catName );
                    cachedImports.put( annotationsFile, annotationsBundle );
                }
            }
        }
    }
}
