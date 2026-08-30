/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2024 - 2026 by Pentaho Canada Inc. : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2030-06-15
 ******************************************************************************/



package org.pentaho.platform.engine.core.system.objfac;

import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.osgi.framework.BundleContext;
import org.osgi.framework.ServiceFactory;
import org.osgi.framework.ServiceReference;
import org.osgi.framework.ServiceRegistration;
import org.pentaho.platform.api.engine.IPentahoObjectReference;
import org.pentaho.platform.api.engine.IPentahoObjectRegistration;
import org.pentaho.platform.engine.core.system.objfac.references.SingletonPentahoObjectReference;

import java.util.Collections;
import java.util.Dictionary;
import java.util.List;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Created by nbaker on 5/3/15.
 */
public class OSGIRuntimeObjectFactoryTest {

  private OSGIRuntimeObjectFactory objectFactory;

  @Mock
  private BundleContext bundleContext;

  @Before
  public void setup() {
    objectFactory = new OSGIRuntimeObjectFactory();
    MockitoAnnotations.initMocks( this );
  }


  @Test
  public void testRegisterReferenceHeldUntilOSGIReady() throws Exception {

    SingletonPentahoObjectReference<String> ref = new SingletonPentahoObjectReference<>( String.class, "Testing",
      Collections.singletonMap( "foo", "bar" ), 10 );
    objectFactory.registerReference( ref, String.class );
    String s = objectFactory.get( String.class, null );
    assertEquals( "Testing", s );
    objectFactory.setBundleContext( bundleContext );

    ArgumentCaptor<ServiceFactory> serviceFactoryArgumentCaptor = ArgumentCaptor.forClass( ServiceFactory.class );
    verify( bundleContext ).registerService( eq( String.class.getName() ), serviceFactoryArgumentCaptor.capture(),
        any( Dictionary.class ) );
    Object service = serviceFactoryArgumentCaptor.getValue().getService( null, null );
    assertEquals( "Testing", service );

  }


  @Test
  public void testRegisterReferencePassesToOSGI() {
    objectFactory.setBundleContext( bundleContext );
    SingletonPentahoObjectReference<String> ref = new SingletonPentahoObjectReference<>( String.class, "Testing",
      Collections.singletonMap( "foo", "bar" ), 10 );
    objectFactory.registerReference( ref, String.class );
    ArgumentCaptor<ServiceFactory> serviceFactoryArgumentCaptor = ArgumentCaptor.forClass( ServiceFactory.class );
    verify( bundleContext ).registerService( eq( String.class.getName() ), serviceFactoryArgumentCaptor.capture(),
        any( Dictionary.class ) );
    Object service = serviceFactoryArgumentCaptor.getValue().getService( null, null );
    assertEquals( "Testing", service );

  }

  @Test
  public void testObjectDefined() throws Exception {

    assertFalse( objectFactory.objectDefined( String.class ) );

    SingletonPentahoObjectReference<String> ref = new SingletonPentahoObjectReference<>( String.class, "Testing",
      Collections.singletonMap( "foo", "bar" ), 10 );
    IPentahoObjectRegistration iPentahoObjectRegistration = objectFactory.registerReference( ref, String.class );
    String s = objectFactory.get( String.class, null );
    assertEquals( "Testing", s );
    assertTrue( objectFactory.objectDefined( String.class ) );
    ServiceRegistration registration = mock( ServiceRegistration.class );
    ServiceRegistration registration2 = mock( ServiceRegistration.class );
    ServiceReference mockRef = mock( ServiceReference.class );

    when( bundleContext.registerService( eq( String.class.getName() ), any(), any( Dictionary.class ) ) ).thenReturn(
      registration );
    when( bundleContext.registerService( eq( IPentahoObjectReference.class.getName() ), any(), any( Dictionary.class ) ) ).thenReturn( registration2 );

    objectFactory.setBundleContext( bundleContext );
    when( bundleContext.getServiceReference( String.class ) ).thenReturn( mockRef );
    assertTrue( objectFactory.objectDefined( String.class ) );
    iPentahoObjectRegistration.remove();
    verify( registration, times( 1 ) ).unregister();

  }

  /**
   * De-OSGi (WI-1.4): a reference registered while the container is already up must still be held in
   * the in-JVM registry, so classic consumers can reach it without round-tripping through the OSGi
   * forward bridge. Before the fix this returned null once {@code setBundleContext} had been called.
   */
  @Test
  public void testReferenceStaysInLocalRegistryWhenRegisteredWithOsgiUp() throws Exception {
    objectFactory.setBundleContext( bundleContext );
    // container exposes nothing for String
    when( bundleContext.getServiceReference( String.class.getName() ) ).thenReturn( null );

    SingletonPentahoObjectReference<String> ref = new SingletonPentahoObjectReference<>( String.class, "Testing",
      Collections.singletonMap( "foo", "bar" ), 10 );
    objectFactory.registerReference( ref, String.class );

    assertTrue( "local registry should answer when OSGi has no such service",
      objectFactory.objectDefined( String.class ) );
    assertEquals( "Testing", objectFactory.get( String.class, null ) );
    List<IPentahoObjectReference<String>> refs = objectFactory.getObjectReferences( String.class, null );
    assertEquals( 1, refs.size() );
  }

  /**
   * De-OSGi (WI-1.4): when the Phase-0 blocklist marks a type as "de-OSGi'd", the runtime factory must
   * fall through to the in-JVM registry even if a bare OSGi service for that type is still registered.
   */
  @Test
  public void testBlocklistedTypeFallsThroughToLocalRegistry() throws Exception {
    Set<String> previous = Phase0ServiceTrace.blocklist;
    Phase0ServiceTrace.blocklist = Collections.singleton( String.class.getName() );
    try {
      objectFactory.setBundleContext( bundleContext );
      // container WOULD answer, but the type is blocklisted
      when( bundleContext.getServiceReference( String.class.getName() ) ).thenReturn( mock( ServiceReference.class ) );

      SingletonPentahoObjectReference<String> ref = new SingletonPentahoObjectReference<>( String.class, "Testing",
        Collections.singletonMap( "foo", "bar" ), 10 );
      objectFactory.registerReference( ref, String.class );

      assertTrue( objectFactory.objectDefined( String.class ) );
      assertEquals( "Testing", objectFactory.get( String.class, null ) );
    } finally {
      Phase0ServiceTrace.blocklist = previous;
    }
  }

  /**
   * Healthy path is unchanged: when the container serves the type, the runtime factory returns nothing
   * from {@code getReferencesByQuery} so callers are not handed a duplicate of the OSGi-served reference.
   */
  @Test
  public void testHealthyOsgiPathReturnsNoDuplicateReference() throws Exception {
    objectFactory.setBundleContext( bundleContext );
    when( bundleContext.getServiceReference( String.class.getName() ) ).thenReturn( mock( ServiceReference.class ) );

    SingletonPentahoObjectReference<String> ref = new SingletonPentahoObjectReference<>( String.class, "Testing",
      Collections.singletonMap( "foo", "bar" ), 10 );
    objectFactory.registerReference( ref, String.class );

    assertTrue( objectFactory.objectDefined( String.class ) );
    List<IPentahoObjectReference<String>> refs = objectFactory.getObjectReferences( String.class, null );
    assertTrue( "runtime factory must defer to the forward bridge while OSGi serves the type", refs.isEmpty() );
  }

}

