/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import {
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  DataTypes,
  type CreationOptional,
  type Sequelize
} from 'sequelize'

export const reviewReportReasons = ['spam', 'abusive_content', 'personal_information', 'inappropriate_content'] as const
export const reviewReportStatuses = ['open', 'resolved', 'rejected'] as const

export type ReviewReportReason = typeof reviewReportReasons[number]
export type ReviewReportStatus = typeof reviewReportStatuses[number]

class ReviewReportModel extends Model<
InferAttributes<ReviewReportModel>,
InferCreationAttributes<ReviewReportModel>
> {
  declare id: CreationOptional<number>
  declare ReporterId: number
  declare reviewId: string
  declare reason: ReviewReportReason
  declare status: CreationOptional<ReviewReportStatus>
  declare ResolverId: CreationOptional<number | null>
  declare resolvedAt: CreationOptional<Date | null>
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>
}

const ReviewReportModelInit = (sequelize: Sequelize) => {
  ReviewReportModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      ReporterId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      reviewId: {
        type: DataTypes.STRING,
        allowNull: false
      },
      reason: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [reviewReportReasons as unknown as string[]] }
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'open',
        validate: { isIn: [reviewReportStatuses as unknown as string[]] }
      },
      ResolverId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE
    },
    {
      tableName: 'ReviewReports',
      sequelize,
      indexes: [
        { unique: true, fields: ['ReporterId', 'reviewId'] }
      ]
    }
  )
}

export { ReviewReportModel, ReviewReportModelInit }
