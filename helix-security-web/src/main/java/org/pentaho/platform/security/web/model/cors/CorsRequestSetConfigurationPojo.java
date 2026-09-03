/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2026 by Pentaho Canada Inc. : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2030-06-15
 ******************************************************************************/

package org.pentaho.platform.security.web.model.cors;

import org.pentaho.platform.security.web.model.matcher.RequestMatcher;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;

/**
 * Mutable {@link CorsRequestSetConfiguration} bean. Fields are {@code protected} so a config can be
 * subclassed; all accessors are present for Spring XML property wiring.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.model.cors.CorsRequestSetConfigurationPojo}.
 */
public class CorsRequestSetConfigurationPojo implements CorsRequestSetConfiguration {

  /** A shared, permanently-disabled configuration. */
  public static final CorsRequestSetConfiguration DISABLED = new CorsRequestSetConfigurationPojo( false );

  protected String name;
  protected String parentName;
  protected RequestMatcher requestMatcher;
  protected boolean isEnabled = true;
  protected boolean isAbstract;
  protected Set<String> allowedOrigins = Collections.emptySet();
  protected Set<String> allowedMethods = Collections.emptySet();
  protected Set<String> allowedHeaders = Collections.emptySet();
  protected Set<String> exposedHeaders = Collections.emptySet();
  protected Boolean allowCredentials;
  protected Long maxAge;

  public CorsRequestSetConfigurationPojo() {
  }

  public CorsRequestSetConfigurationPojo( boolean isEnabled ) {
    this.isEnabled = isEnabled;
  }

  /** Copy constructor. */
  public CorsRequestSetConfigurationPojo( CorsRequestSetConfiguration other ) {
    this.name = other.getName();
    this.parentName = other.getParentName();
    this.requestMatcher = other.getRequestMatcher();
    this.isEnabled = other.isEnabled();
    this.isAbstract = other.isAbstract();
    this.allowedOrigins = copySet( other.getAllowedOrigins() );
    this.allowedMethods = copySet( other.getAllowedMethods() );
    this.allowedHeaders = copySet( other.getAllowedHeaders() );
    this.exposedHeaders = copySet( other.getExposedHeaders() );
    this.allowCredentials = other.getAllowCredentials();
    this.maxAge = other.getMaxAge();
  }

  private static Set<String> copySet( Set<String> in ) {
    return in == null ? Collections.emptySet() : new LinkedHashSet<>( in );
  }

  @Override public String getName() {
    return name;
  }

  public void setName( String name ) {
    this.name = name;
  }

  @Override public String getParentName() {
    return parentName;
  }

  public void setParentName( String parentName ) {
    this.parentName = parentName;
  }

  @Override public RequestMatcher getRequestMatcher() {
    return requestMatcher;
  }

  public void setRequestMatcher( RequestMatcher requestMatcher ) {
    this.requestMatcher = requestMatcher;
  }

  @Override public boolean isEnabled() {
    return isEnabled;
  }

  public void setEnabled( boolean enabled ) {
    this.isEnabled = enabled;
  }

  @Override public boolean isAbstract() {
    return isAbstract;
  }

  public void setAbstract( boolean isAbstract ) {
    this.isAbstract = isAbstract;
  }

  @Override public Set<String> getAllowedOrigins() {
    return allowedOrigins;
  }

  public void setAllowedOrigins( Set<String> allowedOrigins ) {
    this.allowedOrigins = copySet( allowedOrigins );
  }

  @Override public Set<String> getAllowedMethods() {
    return allowedMethods;
  }

  public void setAllowedMethods( Set<String> allowedMethods ) {
    this.allowedMethods = copySet( allowedMethods );
  }

  @Override public Set<String> getAllowedHeaders() {
    return allowedHeaders;
  }

  public void setAllowedHeaders( Set<String> allowedHeaders ) {
    this.allowedHeaders = copySet( allowedHeaders );
  }

  @Override public Set<String> getExposedHeaders() {
    return exposedHeaders;
  }

  public void setExposedHeaders( Set<String> exposedHeaders ) {
    this.exposedHeaders = copySet( exposedHeaders );
  }

  @Override public Boolean getAllowCredentials() {
    return allowCredentials;
  }

  public void setAllowCredentials( Boolean allowCredentials ) {
    this.allowCredentials = allowCredentials;
  }

  @Override public Long getMaxAge() {
    return maxAge;
  }

  public void setMaxAge( Long maxAge ) {
    this.maxAge = maxAge;
  }

  @Override
  public boolean equals( Object o ) {
    if ( this == o ) {
      return true;
    }
    if ( !( o instanceof CorsRequestSetConfigurationPojo ) ) {
      return false;
    }
    CorsRequestSetConfigurationPojo that = (CorsRequestSetConfigurationPojo) o;
    return isEnabled == that.isEnabled
      && isAbstract == that.isAbstract
      && Objects.equals( name, that.name )
      && Objects.equals( parentName, that.parentName )
      && Objects.equals( requestMatcher, that.requestMatcher )
      && Objects.equals( allowedOrigins, that.allowedOrigins )
      && Objects.equals( allowedMethods, that.allowedMethods )
      && Objects.equals( allowedHeaders, that.allowedHeaders )
      && Objects.equals( exposedHeaders, that.exposedHeaders )
      && Objects.equals( allowCredentials, that.allowCredentials )
      && Objects.equals( maxAge, that.maxAge );
  }

  @Override
  public int hashCode() {
    return Objects.hash( name, parentName, requestMatcher, isEnabled, isAbstract, allowedOrigins,
      allowedMethods, allowedHeaders, exposedHeaders, allowCredentials, maxAge );
  }
}
