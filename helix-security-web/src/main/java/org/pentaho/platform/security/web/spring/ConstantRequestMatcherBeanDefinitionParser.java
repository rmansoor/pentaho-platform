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

package org.pentaho.platform.security.web.spring;

import org.pentaho.platform.security.web.model.matcher.RequestMatcher;
import org.springframework.beans.factory.support.BeanDefinitionBuilder;
import org.springframework.beans.factory.xml.AbstractSingleBeanDefinitionParser;
import org.w3c.dom.Element;

/**
 * Parses {@code <hsw:all-request-matcher/>} / {@code <hsw:none-request-matcher/>} into a reference to
 * the {@link RequestMatcher#ALL} / {@link RequestMatcher#NONE} constant.
 */
public class ConstantRequestMatcherBeanDefinitionParser extends AbstractSingleBeanDefinitionParser {

  private final boolean all;

  public ConstantRequestMatcherBeanDefinitionParser( boolean all ) {
    this.all = all;
  }

  @Override
  protected Class<?> getBeanClass( Element element ) {
    return RequestMatcher.class;
  }

  @Override
  protected boolean shouldGenerateIdAsFallback() {
    return true;
  }

  @Override
  protected void doParse( Element element, BeanDefinitionBuilder builder ) {
    RequestMatcher matcher = all ? RequestMatcher.ALL : RequestMatcher.NONE;
    builder.getRawBeanDefinition().setInstanceSupplier( () -> matcher );
  }
}
