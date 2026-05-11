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


package org.pentaho.platform.api.util;

import org.pentaho.platform.api.importexport.IExportHelper;
import org.pentaho.platform.api.importexport.ExportException;
import java.util.Set;

public interface IPentahoPlatformExporter {
  void addExportHelper( IExportHelper helper );

  IRepositoryExportLogger getRepositoryExportLogger();

  /**
   * Export a specific file from the repository to the export bundle.
   * Used by export helpers to export files referenced by other components (e.g., files referenced by schedules).
   * 
   * @param repositoryFilePath the repository path of the file to export
   * @throws ExportException if the file cannot be exported
   */
  void exportFileByPath( String repositoryFilePath ) throws ExportException;

  /**
   * Export only selected users and their roles (used by plugins like scheduler to export dependencies).
   * 
   * @param selectedUsernames Set of usernames to export
   */
  void exportScheduleOwnersAndRoles( Set<String> selectedUsernames );

  /**
   * Export a single user and their roles with user settings.
   * 
   * @param username the username to export
   * @return true if the user was successfully exported, false otherwise
   */
  boolean exportUserAndRole( String username );

}
