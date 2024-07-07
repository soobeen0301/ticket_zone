import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Book } from './entities/Book.entity';
import { User } from '../user/entities/user.entity';
import { Show } from '../show/entities/show.entity';
import { CreateBookDto } from './dto/booking.bto';
import { Status } from './types/book-status.type';
import { HTTP_STATUS } from 'src/constants/http-status.constant';

@Injectable()
export class BookService {
  constructor(
    @InjectRepository(Book)
    private bookRepository: Repository<Book>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Show)
    private showRepository: Repository<Show>,
  ) {}

  async createBook(createBookDto: CreateBookDto, userId: number) {
    const { showName, dateTime } = createBookDto;

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    const show = await this.showRepository.findOne({ where: { showName } });
    if (!show) {
      throw new NotFoundException('공연을 찾을 수 없습니다.');
    }

    if (!show.dateTime.includes(dateTime)) {
      throw new BadRequestException('해당 시간에 공연이 없습니다.');
    }

    if (user.point < show.price) {
      throw new BadRequestException('포인트가 부족합니다.');
    }

    const BooksCount = await this.bookRepository.count({
      where: { show: { id: show.id }, dateTime },
    });

    if (BooksCount >= show.totalSeats) {
      throw new BadRequestException('예약이 이미 만석입니다.');
    }

    let newBook;
    await this.bookRepository.manager.transaction(async (manager) => {
     const book = this.bookRepository.create({ user, show, dateTime });
     newBook = await manager.save(book);

      user.point -= show.price;
      await manager.save(user);

      show.totalSeats -= 1;
      await manager.save(show);
    });

    return {
      status: HTTP_STATUS.CREATED,
      message: '예매가 완료되었습니다.',
      data: {
        bookingId: newBook.id,
        showName: show.showName,
        place: show.place,
        price: show.price,
        dateTime,
        status: Status.Booked,
        createdAt: newBook.createdAt,
        updatedAt: newBook.updatedAt,
      },
    };
  }

  async getUserBookings(userId : number): Promise<any[]> {
    const bookings = await this.bookRepository.find({
        where : {user: {id: userId}},
        relations: ['show'],
        order: {createdAt: 'DESC'}
    });

    if (bookings.length === 0) {
        throw new NotFoundException('예매한 공연 내역이 없습니다.')
    }

    return bookings.map(booking => ({
        status : HTTP_STATUS.OK,
        date : {
            bookId: booking.id,
            showName: booking.show.showName,
            place: booking.show.place,
            price: booking.show.price,
            dateTime: booking.show.dateTime,
            status: booking.status,
            bookDate: booking.dateTime,
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt
        },
    }));
  }
}
