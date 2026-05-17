/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2024 by Hitachi Vantara, LLC : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2028-08-13
 ******************************************************************************/

package org.pentaho.platform.plugin.services.exporter.helper;

import org.pentaho.platform.api.importexport.ExportException;
import org.pentaho.platform.api.importexport.IExportHelper;
import org.pentaho.platform.plugin.services.exporter.PentahoPlatformExporter;

/**
 * Export helper for users and roles.
 * Coordinates user and role export with configuration-based filtering.
 */
public class UsersAndRolesExportHelper implements IExportHelper {
  private PentahoPlatformExporter exporter;

  public UsersAndRolesExportHelper( PentahoPlatformExporter exporter ) {
    this.exporter = exporter;
  }

  @Override
  public String getName() {
    return "UsersAndRolesExporter";
  }

  @Override
  public void doExport( Object exportArg ) throws ExportException {
    // Check if users and roles should be exported
    if ( !exporter.getComponentConfig().isIncludeUsers() ) {
      exporter.getRepositoryExportLogger().debug( "Skipping users and roles export (not included in backup configuration)" );
      return;
    }
    try {
      exporter.delegateExportUsersAndRoles();
    } catch ( Exception e ) {
      throw new ExportException( "Failed to export users and roles: " + e.getMessage(), e );
    }
  }
}
