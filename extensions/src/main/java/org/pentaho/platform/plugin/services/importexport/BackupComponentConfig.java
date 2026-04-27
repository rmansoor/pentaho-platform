/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2024 by Hitachi Vantara, LLC : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2029-07-20
 ******************************************************************************/

package org.pentaho.platform.plugin.services.importexport;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Configuration for selective backup/restore of repository components.
 * Allows users to choose which system components to include in a backup.
 *
 * @author Pentaho Platform Team
 * @since 9.0
 */
public class BackupComponentConfig implements Serializable {
  private static final long serialVersionUID = 1L;

  // Component flags
  private boolean includeContent = true;
  private boolean includeUsers = true;
  private boolean includeDatasources = true;
  private boolean includeMetastore = true;
  private boolean includeSchedules = true;
  private boolean includeUserSettings = true;
  private boolean includeMondrian = true;

  // Configuration metadata
  private String backupName;
  private String description;
  private long createdTimestamp;
  private int version = 1;

  /**
   * Default constructor - includes all components
   */
  public BackupComponentConfig() {
    this.createdTimestamp = System.currentTimeMillis();
  }

  /**
   * Constructor with backup name
   */
  public BackupComponentConfig( String backupName ) {
    this();
    this.backupName = backupName;
  }

  /**
   * Full system backup - includes all components
   */
  public static BackupComponentConfig fullSystem() {
    BackupComponentConfig config = new BackupComponentConfig( "Full System Backup" );
    config.includeContent = true;
    config.includeUsers = true;
    config.includeDatasources = true;
    config.includeMetastore = true;
    config.includeSchedules = true;
    config.includeUserSettings = true;
    config.includeMondrian = true;
    return config;
  }

  /**
   * Content only backup - repository files/folders only
   */
  public static BackupComponentConfig contentOnly() {
    BackupComponentConfig config = new BackupComponentConfig( "Content Only Backup" );
    config.includeContent = true;
    config.includeUsers = false;
    config.includeDatasources = false;
    config.includeMetastore = false;
    config.includeSchedules = false;
    config.includeUserSettings = false;
    config.includeMondrian = false;
    return config;
  }

  /**
   * Security only backup - users and roles
   */
  public static BackupComponentConfig securityOnly() {
    BackupComponentConfig config = new BackupComponentConfig( "Security Only Backup" );
    config.includeContent = false;
    config.includeUsers = true;
    config.includeDatasources = false;
    config.includeMetastore = false;
    config.includeSchedules = false;
    config.includeUserSettings = false;
    config.includeMondrian = false;
    return config;
  }

  /**
   * Data integration backup - datasources and metadata
   */
  public static BackupComponentConfig dataIntegration() {
    BackupComponentConfig config = new BackupComponentConfig( "Data Integration Backup" );
    config.includeContent = false;
    config.includeUsers = false;
    config.includeDatasources = true;
    config.includeMetastore = true;
    config.includeSchedules = false;
    config.includeUserSettings = false;
    config.includeMondrian = true;
    return config;
  }

  /**
   * Infrastructure backup - schedules and settings
   */
  public static BackupComponentConfig infrastructure() {
    BackupComponentConfig config = new BackupComponentConfig( "Infrastructure Backup" );
    config.includeContent = false;
    config.includeUsers = false;
    config.includeDatasources = false;
    config.includeMetastore = false;
    config.includeSchedules = true;
    config.includeUserSettings = true;
    config.includeMondrian = false;
    return config;
  }

  /**
   * Validate backup configuration
   */
  public boolean isValid() {
    // At least one component must be selected
    return includeContent || includeUsers || includeDatasources || includeMetastore
        || includeSchedules || includeUserSettings || includeMondrian;
  }

  /**
   * Get list of enabled components
   */
  public List<String> getEnabledComponents() {
    List<String> components = new ArrayList<>();

    if ( includeContent ) {
      components.add( "CONTENT" );
    }
    if ( includeUsers ) {
      components.add( "USERS_AND_ROLES" );
    }
    if ( includeDatasources ) {
      components.add( "DATASOURCES" );
    }
    if ( includeMetastore ) {
      components.add( "METASTORE" );
    }
    if ( includeSchedules ) {
      components.add( "SCHEDULES" );
    }
    if ( includeUserSettings ) {
      components.add( "USER_SETTINGS" );
    }
    if ( includeMondrian ) {
      components.add( "MONDRIAN" );
    }

    return components;
  }

  /**
   * Convert to map for easy passing to exporter
   */
  public Map<String, Boolean> toMap() {
    Map<String, Boolean> map = new HashMap<>();
    map.put( "content", includeContent );
    map.put( "users", includeUsers );
    map.put( "datasources", includeDatasources );
    map.put( "metastore", includeMetastore );
    map.put( "schedules", includeSchedules );
    map.put( "userSettings", includeUserSettings );
    map.put( "mondrian", includeMondrian );
    return map;
  }

  /**
   * Get total number of selected components
   */
  public int getComponentCount() {
    int count = 0;
    if ( includeContent ) count++;
    if ( includeUsers ) count++;
    if ( includeDatasources ) count++;
    if ( includeMetastore ) count++;
    if ( includeSchedules ) count++;
    if ( includeUserSettings ) count++;
    if ( includeMondrian ) count++;
    return count;
  }

  /**
   * Human-readable summary
   */
  @Override
  public String toString() {
    return String.format(
        "BackupComponentConfig{name='%s', components=%s, enabled=%d}",
        backupName,
        getEnabledComponents(),
        getComponentCount()
    );
  }

  // Getters and Setters

  public boolean isIncludeContent() {
    return includeContent;
  }

  public void setIncludeContent( boolean includeContent ) {
    this.includeContent = includeContent;
  }

  public boolean isIncludeUsers() {
    return includeUsers;
  }

  public void setIncludeUsers( boolean includeUsers ) {
    this.includeUsers = includeUsers;
  }

  public boolean isIncludeDatasources() {
    return includeDatasources;
  }

  public void setIncludeDatasources( boolean includeDatasources ) {
    this.includeDatasources = includeDatasources;
  }

  public boolean isIncludeMetastore() {
    return includeMetastore;
  }

  public void setIncludeMetastore( boolean includeMetastore ) {
    this.includeMetastore = includeMetastore;
  }

  public boolean isIncludeSchedules() {
    return includeSchedules;
  }

  public void setIncludeSchedules( boolean includeSchedules ) {
    this.includeSchedules = includeSchedules;
  }

  public boolean isIncludeUserSettings() {
    return includeUserSettings;
  }

  public void setIncludeUserSettings( boolean includeUserSettings ) {
    this.includeUserSettings = includeUserSettings;
  }

  public boolean isIncludeMondrian() {
    return includeMondrian;
  }

  public void setIncludeMondrian( boolean includeMondrian ) {
    this.includeMondrian = includeMondrian;
  }

  public String getBackupName() {
    return backupName;
  }

  public void setBackupName( String backupName ) {
    this.backupName = backupName;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription( String description ) {
    this.description = description;
  }

  public long getCreatedTimestamp() {
    return createdTimestamp;
  }

  public void setCreatedTimestamp( long createdTimestamp ) {
    this.createdTimestamp = createdTimestamp;
  }

  public int getVersion() {
    return version;
  }

  public void setVersion( int version ) {
    this.version = version;
  }
}
