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

package org.pentaho.platform.security.web.model.csrf;

import org.pentaho.platform.security.web.model.matcher.RequestMatcher;

import java.util.Objects;

/**
 * Plain {@link CsrfRequestSetConfiguration} holder — one contributed set of CSRF-protected requests.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.impl.model.csrf.CsrfRequestSetConfigurationPojo}.
 * A no-arg constructor + setter support Spring XML; {@link #equals(Object)}/{@link #hashCode()} let the
 * aggregator de-duplicate.
 */
public class CsrfRequestSetConfigurationPojo implements CsrfRequestSetConfiguration {

  private RequestMatcher requestMatcher;

  public CsrfRequestSetConfigurationPojo() {
  }

  public CsrfRequestSetConfigurationPojo( RequestMatcher requestMatcher ) {
    this.requestMatcher = requestMatcher;
  }

  @Override
  public RequestMatcher getRequestMatcher() {
    return requestMatcher;
  }

  public void setRequestMatcher( RequestMatcher requestMatcher ) {
    this.requestMatcher = requestMatcher;
  }

  @Override
  public boolean equals( Object o ) {
    if ( this == o ) {
      return true;
    }
    if ( !( o instanceof CsrfRequestSetConfigurationPojo ) ) {
      return false;
    }
    return Objects.equals( requestMatcher, ( (CsrfRequestSetConfigurationPojo) o ).requestMatcher );
  }

  @Override
  public int hashCode() {
    return Objects.hashCode( requestMatcher );
  }
}
