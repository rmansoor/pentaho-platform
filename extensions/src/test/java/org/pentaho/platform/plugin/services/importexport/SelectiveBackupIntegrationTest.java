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

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;

import org.junit.Before;
import org.junit.Test;
import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.plugin.services.exporter.PentahoPlatformExporter;

/**
 * Integration tests for selective backup/restore functionality
 */
public class SelectiveBackupIntegrationTest {

  private IUnifiedRepository mockRepository;
  private PentahoPlatformExporter exporter;
  private RepositoryFile rootFile;

  @Before
  public void setUp() {
    mockRepository = mock( IUnifiedRepository.class );
    exporter = new PentahoPlatformExporter( mockRepository );

    // Create mock root file
    rootFile = mock( RepositoryFile.class );
    when( rootFile.getPath() ).thenReturn( "/" );
    when( rootFile.isFolder() ).thenReturn( true );
    when( mockRepository.getFile( "/" ) ).thenReturn( rootFile );
  }

  @Test
  public void testFullSystemBackupInitialization() {
    BackupComponentConfig config = BackupComponentConfig.fullSystem();
    exporter.setComponentConfig( config );

    BackupComponentConfig retrievedConfig = exporter.getComponentConfig();
    assertNotNull( retrievedConfig );
    assertTrue( retrievedConfig.isIncludeContent() );
    assertTrue( retrievedConfig.isIncludeUsers() );
  }

  @Test
  public void testContentOnlyBackupInitialization() {
    BackupComponentConfig config = BackupComponentConfig.contentOnly();
    exporter.setComponentConfig( config );

    BackupComponentConfig retrievedConfig = exporter.getComponentConfig();
    assertNotNull( retrievedConfig );
    assertTrue( retrievedConfig.isIncludeContent() );
  }

  @Test
  public void testMultipleBackupProfilesCanBeCombined() {
    // Create a custom profile: Content + Users
    BackupComponentConfig config = new BackupComponentConfig( "Content and Security" );
    config.setIncludeContent( true );
    config.setIncludeUsers( true );
    config.setIncludeDatasources( false );
    config.setIncludeMetastore( false );
    config.setIncludeSchedules( false );
    config.setIncludeUserSettings( false );
    config.setIncludeMondrian( false );

    exporter.setComponentConfig( config );

    BackupComponentConfig retrievedConfig = exporter.getComponentConfig();
    assertNotNull( retrievedConfig );
    assertTrue( retrievedConfig.isValid() );
    assertTrue( retrievedConfig.isIncludeContent() );
    assertTrue( retrievedConfig.isIncludeUsers() );
  }

  @Test
  public void testBackupConfigurationMetadata() {
    BackupComponentConfig config = new BackupComponentConfig( "Metadata Backup" );
    config.setDescription( "Backup of metadata and analysis schemas" );
    config.setIncludeContent( false );
    config.setIncludeDatasources( true );
    config.setIncludeMondrian( true );

    exporter.setComponentConfig( config );

    BackupComponentConfig retrievedConfig = exporter.getComponentConfig();
    assertNotNull( retrievedConfig );
    assertTrue( "Metadata Backup".equals( retrievedConfig.getBackupName() ) );
    assertTrue( retrievedConfig.getDescription().contains( "metadata" ) );
  }

  @Test
  public void testBackupComponentSelectionValidation() {
    BackupComponentConfig config = BackupComponentConfig.securityOnly();

    // Verify only security components are selected
    assertTrue( config.isValid() );
    assertTrue( config.isIncludeUsers() );
    assertTrue( config.getEnabledComponents().contains( "USERS_AND_ROLES" ) );
  }

  @Test
  public void testDataSourceBackupProfile() {
    BackupComponentConfig config = BackupComponentConfig.dataSource();
    exporter.setComponentConfig( config );

    BackupComponentConfig retrievedConfig = exporter.getComponentConfig();
    assertNotNull( retrievedConfig );
    assertTrue( retrievedConfig.isIncludeDatasources() );
    assertTrue( retrievedConfig.isIncludeMetastore() );
    assertTrue( retrievedConfig.isIncludeMondrian() );
  }

  @Test
  public void testInfrastructureBackupProfile() {
    BackupComponentConfig config = BackupComponentConfig.infrastructure();
    exporter.setComponentConfig( config );

    BackupComponentConfig retrievedConfig = exporter.getComponentConfig();
    assertNotNull( retrievedConfig );
    assertTrue( retrievedConfig.isIncludeSchedules() );
    assertTrue( retrievedConfig.isIncludeUserSettings() );
  }

  @Test
  public void testComponentCountCalculation() {
    BackupComponentConfig config = BackupComponentConfig.fullSystem();
    assertTrue( config.getComponentCount() == 7 );

    config = BackupComponentConfig.contentOnly();
    assertTrue( config.getComponentCount() == 1 );

    config = BackupComponentConfig.dataSource();
    assertTrue( config.getComponentCount() == 3 );
  }

  @Test
  public void testBackupConfigurationMapConversion() {
    BackupComponentConfig config = BackupComponentConfig.securityOnly();
    java.util.Map<String, Boolean> map = config.toMap();

    assertNotNull( map );
    assertTrue( map.containsKey( "users" ) );
    assertTrue( map.get( "users" ) );
  }
}
