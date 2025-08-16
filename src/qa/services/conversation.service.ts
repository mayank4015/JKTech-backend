import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateConversationDto, QAFiltersDto } from '../dto';

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(userId: string, dto: CreateConversationDto) {
    return this.prisma.conversation.create({
      data: {
        title: dto.title,
        userId,
      },
      include: {
        questions: {
          include: {
            answer: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async getConversations(
    userId: string,
    page: number,
    limit: number,
    filters: QAFiltersDto,
  ) {
    const where: any = { userId };

    if (filters.search) {
      where.OR = [
        {
          title: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        {
          questions: {
            some: {
              text: {
                contains: filters.search,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    if (filters.isBookmarked !== undefined) {
      where.isBookmarked = filters.isBookmarked;
    }

    if (filters.dateStart && filters.dateEnd) {
      where.createdAt = {
        gte: new Date(filters.dateStart),
        lte: new Date(filters.dateEnd),
      };
    }

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: {
          questions: {
            include: {
              answer: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      conversations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getConversationById(id: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        questions: {
          include: {
            answer: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    return conversation;
  }

  async updateConversation(id: string, userId: string, updates: any) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    return this.prisma.conversation.update({
      where: { id },
      data: updates,
    });
  }

  async deleteConversation(id: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    await this.prisma.conversation.delete({
      where: { id },
    });
  }
}
