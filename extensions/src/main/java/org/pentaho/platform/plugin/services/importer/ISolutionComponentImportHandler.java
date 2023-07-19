package org.pentaho.platform.plugin.services.importer;

import org.apache.commons.logging.Log;
import org.pentaho.platform.api.repository2.unified.IPlatformImportBundle;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;

public interface ISolutionComponentImportHandler {

    void importComponent(ExportManifest manifest, Log logger, IPlatformImportBundle bundle );
    String getComponentName();

}
