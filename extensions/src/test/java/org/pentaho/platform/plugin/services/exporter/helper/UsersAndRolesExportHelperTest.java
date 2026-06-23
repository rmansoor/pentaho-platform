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

import org.junit.After;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.pentaho.platform.api.engine.IPentahoSession;
import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.util.IRepositoryExportLogger;
import org.pentaho.platform.engine.core.system.PentahoSessionHolder;
import org.pentaho.platform.engine.core.system.PentahoSystem;
import org.pentaho.platform.plugin.services.exporter.PentahoPlatformExporter;
import org.pentaho.platform.plugin.services.importexport.RoleExport;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;
import org.pentaho.platform.security.policy.rolebased.IRoleAuthorizationPolicyRoleBindingDao;
import org.pentaho.platform.security.policy.rolebased.RoleBindingStruct;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class UsersAndRolesExportHelperTest {

  private UsersAndRolesExportHelper helper;
  private IRoleAuthorizationPolicyRoleBindingDao roleBindingDao;
  private PentahoPlatformExporter exporter;
  private ExportManifest manifest;

  @Before
  public void setUp() {
    helper = new UsersAndRolesExportHelper();
    roleBindingDao = mock( IRoleAuthorizationPolicyRoleBindingDao.class );
    PentahoSystem.registerObject( roleBindingDao );

    IPentahoSession session = mock( IPentahoSession.class );
    when( session.getName() ).thenReturn( "session name" );
    PentahoSessionHolder.setSession( session );

    manifest = new ExportManifest();
    exporter = new PentahoPlatformExporter( mock( IUnifiedRepository.class ) );
    exporter.setRepositoryExportLogger( mock( IRepositoryExportLogger.class ) );
    exporter.setExportManifest( manifest );
  }

  @After
  public void tearDown() {
    PentahoSystem.clearObjectFactory();
    PentahoSessionHolder.removeSession();
  }

  @Test
  public void testExportRoleBindings_exportsRuntimeToLogicalMapping() {
    // External-auth case: only the runtime-role -> logical-role mapping is exported; each
    // exported role carries its logical roles in permissions and NO members.
    Map<String, List<String>> bindingMap = new HashMap<>();
    List<String> role1Logical = Arrays.asList( "org.pentaho.repository.read", "org.pentaho.repository.create" );
    List<String> role2Logical = Arrays.asList( "org.pentaho.repository.execute" );
    bindingMap.put( "role1", role1Logical );
    bindingMap.put( "role2", role2Logical );

    when( roleBindingDao.getRoleBindingStruct( any() ) )
      .thenReturn( new RoleBindingStruct( null, bindingMap, null ) );

    helper.exportRoleBindings( exporter );

    List<RoleExport> exported = manifest.getRoleExports();
    Assert.assertEquals( 2, exported.size() );

    RoleExport role1 = findRole( exported, "role1" );
    Assert.assertNotNull( role1 );
    Assert.assertEquals( role1Logical, role1.getPermissions() );
    Assert.assertTrue( "No members expected for external auth export",
      role1.getAssignedUserNames() == null || role1.getAssignedUserNames().isEmpty() );

    RoleExport role2 = findRole( exported, "role2" );
    Assert.assertNotNull( role2 );
    Assert.assertEquals( role2Logical, role2.getPermissions() );
  }

  @Test
  public void testExportRoleBindings_emptyBindingMapExportsNothing() {
    when( roleBindingDao.getRoleBindingStruct( any() ) )
      .thenReturn( new RoleBindingStruct( null, new HashMap<>(), null ) );

    helper.exportRoleBindings( exporter );

    Assert.assertTrue( manifest.getRoleExports().isEmpty() );
  }

  @Test
  public void testExportRoleBindings_nullBindingMapExportsNothing() {
    when( roleBindingDao.getRoleBindingStruct( any() ) )
      .thenReturn( new RoleBindingStruct( null, null, null ) );

    helper.exportRoleBindings( exporter );

    Assert.assertTrue( manifest.getRoleExports().isEmpty() );
  }

  private RoleExport findRole( List<RoleExport> roles, String name ) {
    for ( RoleExport r : roles ) {
      if ( name.equals( r.getRolename() ) ) {
        return r;
      }
    }
    return null;
  }
}
